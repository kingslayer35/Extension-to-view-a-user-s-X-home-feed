class XFeedViewer {
    constructor() {
        this.elements = {
            usernameInput: document.getElementById("username"),
            authInput: document.getElementById("auth_token"),
            ct0Input: document.getElementById("ct0"),
            bearerInput: document.getElementById("bearer"),
            saveBtn: document.getElementById("saveTokens"),
            loadBtn: document.getElementById("loadFeed"),
            refreshBtn: document.getElementById("refreshFeed"),
            accountSelect: document.getElementById("accountSelect"),
            feedDiv: document.getElementById("feed"),
            statusDiv: document.getElementById("status"),
            clearAllBtn: document.getElementById("clearAll"),
            exportBtn: document.getElementById("exportTokens"),
            importBtn: document.getElementById("importBtn"),
            importFile: document.getElementById("importTokens"),
            settingsBtn: document.getElementById("settingsBtn"),
            helpLink: document.getElementById("helpLink"),
            helpModal: document.getElementById("helpModal"),
            feedHeader: document.getElementById("feedHeader"),
            feedUser: document.getElementById("feedUser"),
            feedCount: document.getElementById("feedCount")
        };

        this.currentFeedData = null;
        this.isLoading = false;
        this.init();
    }

    init() {
        this.populateAccounts();
        this.setupEventListeners();
        this.setupModal();
    }

    setupEventListeners() {
        this.elements.saveBtn.onclick = () => this.saveAccount();
        this.elements.loadBtn.onclick = () => this.loadFeed();
        this.elements.refreshBtn.onclick = () => this.refreshFeed();
        this.elements.clearAllBtn.onclick = () => this.clearAllAccounts();
        this.elements.exportBtn.onclick = () => this.exportTokens();
        this.elements.importBtn.onclick = () => this.elements.importFile.click();
        this.elements.importFile.onchange = (e) => this.importTokens(e);
        this.elements.settingsBtn.onclick = () => this.openSettings();
        this.elements.helpLink.onclick = (e) => {
            e.preventDefault();
            this.showHelp();
        };
        
        this.elements.accountSelect.onchange = () => {
            this.elements.feedDiv.innerHTML = '';
            this.elements.feedHeader.style.display = 'none';
            this.showStatus('Select an account and click Load Feed', 'info');
        };

        // Auto-save on input change
        [this.elements.usernameInput, this.elements.authInput, this.elements.ct0Input, this.elements.bearerInput]
            .forEach(input => {
                input.addEventListener('input', () => this.validateInputs());
            });
    }

    setupModal() {
        const modal = this.elements.helpModal;
        const closeBtn = modal.querySelector('.close');
        
        closeBtn.onclick = () => modal.style.display = 'none';
        
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    showHelp() {
        this.elements.helpModal.style.display = 'block';
    }

    validateInputs() {
        const user = this.elements.usernameInput.value.trim();
        const authToken = this.elements.authInput.value.trim();
        const ct0 = this.elements.ct0Input.value.trim();
        const bearer = this.elements.bearerInput.value.trim();

        const isValid = user && authToken && ct0 && bearer;
        this.elements.saveBtn.disabled = !isValid;
        
        if (isValid) {
            this.elements.saveBtn.classList.add('ready');
        } else {
            this.elements.saveBtn.classList.remove('ready');
        }
    }

    async populateAccounts() {
        try {
            const data = await this.getStorageData(null);
            this.elements.accountSelect.innerHTML = '<option value="">Select Account</option>';
            
            Object.keys(data).forEach(user => {
                if (user !== 'feedCache' && user !== 'settings') {
                    const opt = document.createElement("option");
                    opt.value = user;
                    opt.innerText = user.startsWith('@') ? user : `@${user}`;
                    this.elements.accountSelect.appendChild(opt);
                }
            });
        } catch (error) {
            console.error('Error populating accounts:', error);
        }
    }

    async saveAccount() {
        const user = this.elements.usernameInput.value.trim().replace('@', '');
        const authToken = this.elements.authInput.value.trim();
        const ct0 = this.elements.ct0Input.value.trim();
        const bearer = this.elements.bearerInput.value.trim();

        if (!user) {
            this.showStatus("Username is required", "error");
            return;
        }

        if (!authToken || !ct0 || !bearer) {
            this.showStatus("All tokens are required", "error");
            return;
        }

        const tokens = { 
            auth_token: authToken, 
            ct0: ct0, 
            bearer: bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`,
            saved_at: Date.now()
        };
        
        try {
            await this.setStorageData({ [user]: tokens });
            this.showStatus(`Account @${user} saved successfully!`, "success");
            await this.populateAccounts();
            this.clearInputs();
        } catch (error) {
            this.showStatus(`Error saving account: ${error.message}`, "error");
        }
    }

    clearInputs() {
        this.elements.usernameInput.value = '';
        this.elements.authInput.value = '';
        this.elements.ct0Input.value = '';
        this.elements.bearerInput.value = '';
        this.validateInputs();
    }

    async loadFeed() {
        const selectedUser = this.elements.accountSelect.value;
        if (!selectedUser) {
            this.showStatus("Please select an account", "error");
            return;
        }

        if (this.isLoading) return;
        
        this.setLoading(true);
        this.showStatus("Loading feed...", "info");

        try {
            const data = await this.getStorageData(selectedUser);
            const tokens = data[selectedUser];
            
            if (!tokens) {
                this.showStatus("Account not found", "error");
                return;
            }

            const response = await this.sendMessage({ 
                type: "fetchFeed", 
                tokens: tokens,
                user: selectedUser
            });
            
            if (response.error) {
                this.showStatus(`Error: ${response.error}`, "error");
            } else {
                this.currentFeedData = response.feed;
                this.renderFeed(response.feed, selectedUser);
                this.showStatus(`Feed loaded for @${selectedUser} using ${response.endpointUsed}`, "success");
                
                if (response.fallbackUsed) {
                    this.showStatus(`Primary endpoint failed, using fallback: ${response.endpointUsed}`, "warning");
                }
            }
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, "error");
        } finally {
            this.setLoading(false);
        }
    }

    refreshFeed() {
        if (this.elements.accountSelect.value) {
            this.loadFeed();
        }
    }

    renderFeed(feed, username) {
        this.elements.feedDiv.innerHTML = '';
        this.elements.feedHeader.style.display = 'block';
        this.elements.feedUser.textContent = `@${username}`;
        
        if (!feed || (!feed.globalObjects && !feed.data)) {
            this.elements.feedDiv.innerHTML = '<div class="loading">No feed data available</div>';
            this.elements.feedCount.textContent = '0 tweets';
            return;
        }

        let tweets = {};
        let users = {};
        let entries = [];

        // Handle different response formats
        if (feed.globalObjects) {
            tweets = feed.globalObjects.tweets || {};
            users = feed.globalObjects.users || {};
            
            const timeline = feed.timeline?.instructions?.find(
                inst => inst.addEntries || inst.replaceEntry
            );
            
            if (timeline) {
                entries = timeline.addEntries?.entries || timeline.replaceEntry?.entries || [];
            }
        } else if (feed.data) {
            // Handle GraphQL response format
            const timelineData = feed.data.home?.home_timeline_urt || feed.data;
            if (timelineData.instructions) {
                const instruction = timelineData.instructions.find(inst => inst.type === 'TimelineAddEntries');
                if (instruction) {
                    entries = instruction.entries || [];
                }
            }
        }

        const tweetEntries = entries.filter(entry => 
            entry.entryId && (
                entry.entryId.startsWith('tweet-') || 
                entry.entryId.startsWith('homeConversation-')
            )
        );

        this.elements.feedCount.textContent = `${tweetEntries.length} tweets`;

        if (tweetEntries.length === 0) {
            this.elements.feedDiv.innerHTML = '<div class="loading">No tweets found in timeline</div>';
            return;
        }

        tweetEntries.forEach(entry => {
            const tweetId = this.extractTweetId(entry);
            if (tweetId && tweets[tweetId]) {
                const tweet = tweets[tweetId];
                const user = users[tweet.user_id_str];
                const tweetElement = this.createTweetElement(tweet, user);
                this.elements.feedDiv.appendChild(tweetElement);
            }
        });

        // Add infinite scroll
        this.setupInfiniteScroll();
    }

    extractTweetId(entry) {
        if (entry.content?.item?.content?.tweet?.id) {
            return entry.content.item.content.tweet.id;
        }
        if (entry.content?.timelineModule?.items) {
            const item = entry.content.timelineModule.items[0];
            return item?.item?.content?.tweet?.id;
        }
        return null;
    }

    createTweetElement(tweet, user) {
        const el = document.createElement('div');
        el.className = 'tweet';
        el.setAttribute('data-tweet-id', tweet.id_str);
        
        const createdAt = new Date(tweet.created_at).toLocaleString();
        const displayName = user?.name || 'Unknown User';
        const screenName = user?.screen_name || 'unknown';
        const profileImage = user?.profile_image_url_https || '';
        
        let mediaHtml = '';
        if (tweet.extended_entities?.media) {
            tweet.extended_entities.media.forEach(mediaItem => {
                if (mediaItem.type === 'photo') {
                    mediaHtml += `<img src="${mediaItem.media_url_https}" alt="Tweet image" loading="lazy" onclick="this.requestFullscreen()">`;
                } else if (mediaItem.type === 'video' || mediaItem.type === 'animated_gif') {
                    const videoUrl = mediaItem.video_info?.variants?.find(v => v.content_type === 'video/mp4')?.url;
                    if (videoUrl) {
                        mediaHtml += `<video controls preload="metadata"><source src="${videoUrl}" type="video/mp4">Your browser does not support the video tag.</video>`;
                    }
                }
            });
        }

        el.innerHTML = `
            <div class="tweet-header">
                ${profileImage ? `<img src="${profileImage}" alt="Profile" class="profile-image">` : '<div class="profile-placeholder"></div>'}
                <div class="user-info">
                    <span class="tweet-author">${this.escapeHtml(displayName)}</span>
                    <span class="tweet-handle">@${this.escapeHtml(screenName)}</span>
                </div>
                <span class="tweet-time" title="${new Date(tweet.created_at).toISOString()}">${this.formatRelativeTime(new Date(tweet.created_at))}</span>
            </div>
            <div class="tweet-text">${this.formatTweetText(tweet.full_text || tweet.text)}</div>
            ${mediaHtml ? `<div class="tweet-media">${mediaHtml}</div>` : ''}
            <div class="tweet-stats">
                <span class="stat">💬 ${this.formatNumber(tweet.reply_count || 0)}</span>
                <span class="stat">🔄 ${this.formatNumber(tweet.retweet_count || 0)}</span>
                <span class="stat">❤️ ${this.formatNumber(tweet.favorite_count || 0)}</span>
                ${tweet.quote_count ? `<span class="stat">💭 ${this.formatNumber(tweet.quote_count)}</span>` : ''}
            </div>
        `;
        
        return el;
    }

    formatTweetText(text) {
        if (!text) return '';
        
        return this.escapeHtml(text)
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="tweet-link">$1</a>')
            .replace(/@(\w+)/g, '<span class="mention">@$1</span>')
            .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
            .replace(/\n/g, '<br>');
    }

    formatRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return `${seconds}s`;
        if (minutes < 60) return `${minutes}m`;
        if (hours < 24) return `${hours}h`;
        if (days < 7) return `${days}d`;
        return date.toLocaleDateString();
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupInfiniteScroll() {
        const feedContainer = this.elements.feedDiv;
        
        feedContainer.addEventListener('scroll', () => {
            if (feedContainer.scrollTop + feedContainer.clientHeight >= feedContainer.scrollHeight - 100) {
                // Load more tweets (implement pagination if needed)
                console.log('Load more tweets...');
            }
        });
    }

    async clearAllAccounts() {
        if (confirm('Are you sure you want to clear all saved accounts?')) {
            try {
                await chrome.storage.local.clear();
                await this.populateAccounts();
                this.elements.feedDiv.innerHTML = '';
                this.elements.feedHeader.style.display = 'none';
                this.showStatus('All accounts cleared', 'success');
            } catch (error) {
                this.showStatus(`Error clearing accounts: ${error.message}`, 'error');
            }
        }
    }

    async exportTokens() {
        try {
            const data = await this.getStorageData(null);
            delete data.feedCache;
            delete data.settings;
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `x-feed-viewer-tokens-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.showStatus('Tokens exported successfully', 'success');
        } catch (error) {
            this.showStatus(`Export failed: ${error.message}`, 'error');
        }
    }

    async importTokens(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                await this.setStorageData(data);
                await this.populateAccounts();
                this.showStatus('Tokens imported successfully', 'success');
            } catch (error) {
                this.showStatus('Invalid JSON file', 'error');
            }
        };
        reader.readAsText(file);
    }

    openSettings() {
        chrome.runtime.openOptionsPage();
    }

    showStatus(message, type) {
        this.elements.statusDiv.textContent = message;
        this.elements.statusDiv.className = `status ${type}`;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.elements.statusDiv.textContent = '';
            this.elements.statusDiv.className = 'status';
        }, 5000);
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.elements.loadBtn.disabled = loading;
        this.elements.refreshBtn.disabled = loading;
        this.elements.loadBtn.textContent = loading ? 'Loading...' : 'Load Feed';
        
        if (loading) {
            this.elements.loadBtn.classList.add('loading');
        } else {
            this.elements.loadBtn.classList.remove('loading');
        }
    }

    // Helper functions
    getStorageData(key) {
        return new Promise(resolve => {
            chrome.storage.local.get(key, resolve);
        });
    }

    setStorageData(data) {
        return new Promise(resolve => {
            chrome.storage.local.set(data, resolve);
        });
    }

    sendMessage(message) {
        return new Promise(resolve => {
            chrome.runtime.sendMessage(message, resolve);
        });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new XFeedViewer();
});
