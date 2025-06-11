// Content script for X Feed Viewer Extension
(function() {
    'use strict';

    class XTokenExtractor {
        constructor() {
            this.init();
        }

        init() {
            if (this.isXSite()) {
                this.addExtractButton();
                this.setupMessageListener();
                this.observeTokenChanges();
            }
        }

        isXSite() {
            return window.location.hostname.includes('twitter.com') ||
                window.location.hostname.includes('x.com');
        }

        addExtractButton() {
            // Only add button if it doesn't exist
            if (document.getElementById('xfv-extract-btn')) return;

            const button = document.createElement('button');
            button.id = 'xfv-extract-btn';
            button.textContent = '🔑 Extract Tokens';
            button.title = 'Extract X tokens for Feed Viewer extension';

            Object.assign(button.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: '10000',
                background: '#1d9bf0',
                color: 'white',
                border: 'none',
                padding: '12px 16px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(29, 155, 240, 0.3)',
                transition: 'all 0.2s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            });

            button.addEventListener('mouseenter', () => {
                button.style.background = '#1a8cd8';
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = '0 6px 16px rgba(29, 155, 240, 0.4)';
            });

            button.addEventListener('mouseleave', () => {
                button.style.background = '#1d9bf0';
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 4px 12px rgba(29, 155, 240, 0.3)';
            });

            button.addEventListener('click', () => this.extractAndCopyTokens());

            document.body.appendChild(button);

            // Auto-hide after 10 seconds
            setTimeout(() => {
                if (button.parentNode) {
                    button.style.opacity = '0.7';
                    button.style.transform = 'scale(0.9)';
                }
            }, 10000);
        }

        setupMessageListener() {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.action === 'extractTokens') {
                    const tokens = this.extractTokensFromPage();
                    sendResponse(tokens);
                }
                return true;
            });
        }

        observeTokenChanges() {
            // Watch for navigation changes that might update tokens
            let lastUrl = location.href;
            new MutationObserver(() => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    // Re-extract tokens after navigation
                    setTimeout(() => this.extractTokensFromPage(), 1000);
                }
            }).observe(document, { subtree: true, childList: true });
        }

        extractTokensFromPage() {
            const tokens = {
                auth_token: '',
                ct0: '',
                bearer: '',
                extracted_at: new Date().toISOString()
            };

            try {
                // Extract from cookies
                const cookies = document.cookie.split(';');
                cookies.forEach(cookie => {
                    const [name, value] = cookie.trim().split('=');
                    if (name === 'auth_token') {
                        tokens.auth_token = decodeURIComponent(value);
                    } else if (name === 'ct0') {
                        tokens.ct0 = decodeURIComponent(value);
                    }
                });

                // Extract bearer token from various sources
                tokens.bearer = this.extractBearerToken();

                // Try to get additional info from localStorage
                try {
                    const localData = localStorage.getItem('twitter_sess');
                    if (localData) {
                        const parsed = JSON.parse(localData);
                        if (parsed.auth_token && !tokens.auth_token) {
                            tokens.auth_token = parsed.auth_token;
                        }
                    }
                } catch (e) {
                    console.debug('Could not parse localStorage data');
                }

            } catch (error) {
                console.error('Error extracting tokens:', error);
            }

            return tokens;
        }

        extractBearerToken() {
            // Try multiple methods to extract bearer token

            // Method 1: From script tags
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                if (script.textContent && script.textContent.includes('Bearer')) {
                    const bearerMatch = script.textContent.match(/Bearer\s+([A-Za-z0-9%]+)/);
                    if (bearerMatch) {
                        return `Bearer ${bearerMatch[1]}`;
                    }
                }
            }

            // Method 2: From network requests (if available in window)
            if (window.fetch) {
                const originalFetch = window.fetch;
                let capturedBearer = '';

                window.fetch = function(...args) {
                    const [url, options] = args;
                    if (options && options.headers && options.headers.authorization) {
                        capturedBearer = options.headers.authorization;
                    }
                    return originalFetch.apply(this, args);
                };

                // Restore original fetch after a short delay
                setTimeout(() => {
                    window.fetch = originalFetch;
                }, 5000);

                if (capturedBearer) {
                    return capturedBearer;
                }
            }

            // Method 3: Common bearer token (this is a fallback and might not work)
            return 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
        }

        async extractAndCopyTokens() {
            const button = document.getElementById('xfv-extract-btn');
            const originalText = button.textContent;

            try {
                button.textContent = '🔄 Extracting...';
                button.disabled = true;

                const tokens = this.extractTokensFromPage();

                // Validate tokens
                const isValid = tokens.auth_token && tokens.ct0 && tokens.bearer;

                if (isValid) {
                    // Copy to clipboard
                    const tokenText = `Auth Token: ${tokens.auth_token}\nCT0 Token: ${tokens.ct0}\nBearer Token: ${tokens.bearer}`;

                    try {
                        await navigator.clipboard.writeText(tokenText);
                        button.textContent = '✅ Copied!';
                        button.style.background = '#00ba7c';

                        // Show success notification
                        this.showNotification('Tokens copied to clipboard!', 'success');

                    } catch (clipboardError) {
                        // Fallback: show tokens in a modal
                        this.showTokenModal(tokens);
                        button.textContent = '📋 Tokens Shown';
                        button.style.background = '#00ba7c';
                    }
                } else {
                    button.textContent = '❌ Failed';
                    button.style.background = '#f4212e';
                    this.showNotification('Could not extract all required tokens. Make sure you are logged in.', 'error');
                }

            } catch (error) {
                console.error('Token extraction failed:', error);
                button.textContent = '❌ Error';
                button.style.background = '#f4212e';
                this.showNotification('Token extraction failed. Check console for details.', 'error');
            }

            // Reset button after 3 seconds
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#1d9bf0';
                button.disabled = false;
            }, 3000);
        }

        showTokenModal(tokens) {
            // Create modal to display tokens
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                background: #16181c;
                color: #e7e9ea;
                padding: 24px;
                border-radius: 12px;
                max-width: 500px;
                width: 90%;
                max-height: 80%;
                overflow-y: auto;
                border: 1px solid #2f3336;
            `;

            content.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: #1d9bf0;">Extracted Tokens</h3>
                    <button id="closeModal" style="background: none; border: none; color: #71767b; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600;">Auth Token:</label>
                    <textarea readonly style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #2f3336; border-radius: 6px; color: #e7e9ea; font-size: 13px;" rows="2">${tokens.auth_token}</textarea>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600;">CT0 Token:</label>
                    <textarea readonly style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #2f3336; border-radius: 6px; color: #e7e9ea; font-size: 13px;" rows="2">${tokens.ct0}</textarea>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; font-weight: 600;">Bearer Token:</label>
                    <textarea readonly style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #2f3336; border-radius: 6px; color: #e7e9ea; font-size: 13px;" rows="2">${tokens.bearer}</textarea>
                </div>
            `;

            content.querySelector('#closeModal').onclick = () => {
                document.body.removeChild(modal);
            };

            modal.appendChild(content);
            document.body.appendChild(modal);
        }

        showNotification(message, type) {
            // Simple notification at top right
            const notif = document.createElement('div');
            notif.textContent = message;
            notif.style.cssText = `
                position: fixed;
                top: 24px;
                right: 24px;
                background: ${type === 'success' ? '#00ba7c' : '#f4212e'};
                color: white;
                padding: 14px 22px;
                border-radius: 8px;
                font-size: 15px;
                font-weight: 600;
                z-index: 10002;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                opacity: 0.96;
                transition: opacity 0.3s;
            `;
            document.body.appendChild(notif);
            setTimeout(() => {
                notif.style.opacity = '0';
                setTimeout(() => notif.remove(), 500);
            }, 2200);
        }
    }

    // Initialize extractor
    new XTokenExtractor();
})();
