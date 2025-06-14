// This is the complete and final version of popup.js. No functions have been skipped.
document.addEventListener('DOMContentLoaded', loadSavedAccounts);

async function loadSavedAccounts() {
    const listDiv = document.getElementById('saved-accounts-list');
    try {
        const response = await fetch('http://127.0.0.1:5000/list_accounts');
        const accounts = await response.json();
        
        listDiv.innerHTML = '';
        if (accounts.length === 0) {
            listDiv.innerHTML = '<p>No saved accounts found.</p>';
            return;
        }

        accounts.forEach(name => {
            const button = document.createElement('button');
            button.textContent = `Load Feed for: ${name}`;
            button.className = 'load-button';
            button.onclick = () => loadFeedFor(name);
            listDiv.appendChild(button);
        });
    } catch (error) {
        listDiv.innerHTML = '<p style="color: red;">Error: Could not connect to backend server. Is it running?</p>';
    }
}

async function loadFeedFor(accountName) {
    updateStatus('Loading feed...', 'loading');

    try {
        const response = await fetch('http://127.0.0.1:5000/get_feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_name: accountName })
        });
        
        const result = await response.json();
        if (!response.ok) throw result;

        updateStatus('Feed loaded. Injecting into page...', 'success');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: displayFeedInPage,
            args: [result, accountName]
        });

    } catch (error) {
        let errorMessage;
        if (error.error) {
            errorMessage = `<b>Error:</b> ${error.error}<br><b>Details:</b> ${error.details || 'No details provided.'}`;
        } else {
            errorMessage = `<b>Network Error:</b> Could not load feed. Is the server running? <br><b>Details:</b> ${error.message}`;
        }
        updateStatus(errorMessage, 'error');
    }
}

function updateStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
}

document.getElementById('add-account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    updateStatus('Processing...', 'loading');

    const formData = {
        account_name: document.getElementById('account_name').value,
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
    };

    if (!formData.account_name.trim() || !formData.username.trim() || !formData.password.trim() || !formData.email.trim()) {
        updateStatus('<b>Input Error:</b> All fields are required.', 'error');
        return;
    }

    updateStatus('Logging in and saving session... This may take a moment.', 'loading');

    try {
        const response = await fetch('http://127.0.0.1:5000/add_account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        if (!response.ok) throw result;

        updateStatus(result.message, 'success');
        document.getElementById('add-account-form').reset();
        loadSavedAccounts();
    } catch (error) {
        let errorMessage;
        if (error.error && error.details) {
            errorMessage = `<b>Server Error:</b> ${error.error}<br><b>Details:</b> ${error.details}`;
        } else {
            errorMessage = `<b>Network Error:</b> Could not reach the server. Is it running? <br><b>Details:</b> ${error.message}`;
        }
        updateStatus(errorMessage, 'error');
    }
});


// --- Injected Function ---
function displayFeedInPage(tweets, accountName) {
    const primaryColumn = document.querySelector('div[data-testid="primaryColumn"]');
    if (!primaryColumn) { alert('Could not find the primary column to inject content.'); return; }

    const oldContainer = document.getElementById('custom-feed-container');
    if (oldContainer) oldContainer.remove();

    const feedContainer = document.createElement('div');
    feedContainer.id = 'custom-feed-container';

    let feedHTML = `<h2 style="padding: 1rem; margin:0; text-align: center; color: #e7e9ea; border-bottom: 1px solid #38444d; border-top: 1px solid #38444d;">Displaying Custom Feed for "${accountName}"</h2>`;
    
    function linkify(text) {
        const filteredText = text.replace(/https:\/\/t\.co\/[a-zA-Z0-9]+/g, '');
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        return filteredText.replace(urlPattern, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #1d9bf0;">${url}</a>`);
    }

    function formatStats(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return num.toString();
    }

    tweets.forEach(tweet => {
        const verifiedBadge = tweet.user.is_verified 
            ? `<span style="margin-left: 4px; vertical-align: text-bottom; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background-color: #1d9bf0; border-radius: 50%;"><svg viewBox="0 0 24 24" style="height: 14px; fill: white;"><g><path d="M9.98 15.36l-3.888-3.635 1.332-1.26 2.556 2.373 5.448-5.18 1.332 1.26-6.78 6.44z"></path></g></svg></span>`
            : '';
            
        let mediaHTML = '';
        if (tweet.media && tweet.media.length > 0) {
            const mediaContainerStyle = 'width: 100%; max-height: 500px; object-fit: cover; border-radius: 16px; margin-top: 12px; border: 1px solid #38444d;';
            tweet.media.forEach(mediaItem => {
                const proxiedUrl = `http://127.0.0.1:5000/proxy_image?url=${encodeURIComponent(mediaItem.url)}`;
                if (mediaItem.type === 'photo') {
                    mediaHTML += `<img src="${proxiedUrl}" style="${mediaContainerStyle}">`;
                } else if (mediaItem.type === 'video') {
                    mediaHTML += `<video src="${mediaItem.url}" controls style="${mediaContainerStyle}"></video>`;
                } else if (mediaItem.type === 'animated_gif') {
                    mediaHTML += `<video src="${mediaItem.url}" autoplay loop muted playsinline style="${mediaContainerStyle}"></video>`;
                }
            });
        }
        
        const processedText = linkify(tweet.text);
        const proxiedPfpUrl = `http://127.0.0.1:5000/proxy_image?url=${encodeURIComponent(tweet.user.profile_image_url_https)}`;
        
        feedHTML += `
            <article style="border-bottom: 1px solid #38444d; padding: 1rem; display: flex; flex-direction: column;">
                <div style="display: flex; align-items: flex-start;">
                    <img src="${proxiedPfpUrl}" style="width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0;">
                    <div style="margin-left: 12px; line-height: 1.4; width: 100%;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap;">
                            <span style="font-weight: bold; margin: 0; color: #e7e9ea;">${tweet.user.name}</span>
                            ${verifiedBadge}
                            <span style="font-weight: normal; color: #71767b; margin-left: 5px;">@${tweet.user.screen_name}</span>
                        </div>
                        <div style="margin: 5px 0 0 0; white-space: pre-wrap; word-wrap: break-word; color: #e7e9ea; font-size: 15px;">${processedText}</div>
                    </div>
                </div>
                <div style="margin-top: 12px;">${mediaHTML}</div>
                <div style="display: flex; justify-content: space-between; align-items:center; color: #71767b; margin-top: 12px; font-size: 13px;">
                    <div>
                        <span>❤️ ${formatStats(tweet.stats.likes)}</span>
                        <span style="margin-left: 1rem;">🔁 ${formatStats(tweet.stats.retweets)}</span>
                        <span style="margin-left: 1rem;">👁️ ${formatStats(tweet.stats.views)}</span>
                    </div>
                    <span>${new Date(tweet.created_at).toLocaleString()}</span>
                </div>
            </article>
        `;
    });
    
    feedContainer.innerHTML = feedHTML;
    primaryColumn.prepend(feedContainer);
}