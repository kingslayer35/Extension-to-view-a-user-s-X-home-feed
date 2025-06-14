document.addEventListener('DOMContentLoaded', () => {
    loadSavedAccounts();
    document.getElementById('add-account-form').addEventListener('submit', handleAddAccount);
});

async function loadSavedAccounts() {
    const listDiv = document.getElementById('saved-accounts-list');
    const avatarColors = ['bg-blue-500', 'bg-green-500', 'bg-red-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500'];

    try {
        const response = await fetch('http://127.0.0.1:5000/get-accounts');
        if (!response.ok) throw new Error('Failed to fetch accounts.');
        
        const accounts = await response.json();
        listDiv.innerHTML = '';
        if (accounts.length === 0) {
            listDiv.innerHTML = '<p class="text-x-text-secondary p-3">No saved accounts found.</p>';
            return;
        }

        accounts.forEach((name, index) => {
            const entryContainer = document.createElement('div');
            entryContainer.className = 'w-full';

            const accountRow = document.createElement('div');
            accountRow.className = 'flex w-full items-center p-2 transition-colors hover:bg-white/10';

            const avatar = document.createElement('div');
            const color = avatarColors[index % avatarColors.length];
            avatar.className = `flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${color}`;
            avatar.textContent = name.charAt(0).toUpperCase();

            // --- KEY CHANGE: Text size reduced from text-lg to text-base for a more balanced look ---
            const nameSpan = document.createElement('span');
            nameSpan.className = 'ml-3 flex-grow text-base font-bold';
            nameSpan.textContent = name;

            // --- KEY CHANGE: Button text updated for clarity ---
            const viewButton = document.createElement('button');
            viewButton.textContent = 'View Feed';
            // Note: The font size on the button text was also increased as requested in the previous turn.
            viewButton.className = 'flex-shrink-0 rounded-full bg-x-text-primary px-4 py-1.5 text-sm font-bold text-x-bg transition-colors hover:bg-opacity-90';
            viewButton.onclick = () => loadFeedFor(name);
            
            const statusDiv = document.createElement('div');
            statusDiv.id = `status-${name}`;
            statusDiv.className = 'hidden p-3';

            accountRow.appendChild(avatar);
            accountRow.appendChild(nameSpan);
            accountRow.appendChild(viewButton);
            
            entryContainer.appendChild(accountRow);
            entryContainer.appendChild(statusDiv);
            listDiv.appendChild(entryContainer);
        });
    } catch (error) {
        listDiv.innerHTML = '<p class="text-red-500 p-3">Error: Could not connect to backend server. Is it running?</p>';
    }
}

// --- The rest of the file is unchanged, but included for completeness ---
async function loadFeedFor(accountName) {
    const statusDiv = document.getElementById(`status-${accountName}`);
    updateIndividualStatus(statusDiv, 'Loading feed...', 'loading');
    try {
        const response = await fetch('http://127.0.0.1:5000/get_feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_name: accountName }) });
        const result = await response.json();
        if (!response.ok) throw result;
        updateIndividualStatus(statusDiv, 'Feed loaded. Injecting...', 'success');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: displayFeedInPage, args: [result, accountName] });
    } catch (error) {
        const errorMessage = (error && error.error) ? `<b>Error:</b> ${error.error}<br><b>Details:</b> ${error.details || 'No details.'}` : `<b>Network Error:</b> Could not load feed.`;
        updateIndividualStatus(statusDiv, errorMessage, 'error');
    }
}

function updateIndividualStatus(element, message, type) {
    if (!element) return;
    element.innerHTML = message;
    element.className = 'rounded-md border p-3 text-sm';
    switch (type) {
        case 'success': element.classList.add('bg-green-900/50', 'border-green-700', 'text-green-300'); break;
        case 'error': element.classList.add('bg-red-900/50', 'border-red-700', 'text-red-300'); break;
        case 'loading': element.classList.add('bg-yellow-900/50', 'border-yellow-700', 'text-yellow-300'); break;
    }
}

function updateLoginStatus(message, type) {
    const statusDiv = document.getElementById('login-status');
    statusDiv.innerHTML = message;
    statusDiv.className = 'rounded-md border p-3 text-sm';
    switch (type) {
        case 'success': statusDiv.classList.add('bg-green-900/50', 'border-green-700', 'text-green-300'); break;
        case 'error': statusDiv.classList.add('bg-red-900/50', 'border-red-700', 'text-red-300'); break;
        case 'loading': statusDiv.classList.add('bg-yellow-900/50', 'border-yellow-700', 'text-yellow-300'); break;
    }
}

async function handleAddAccount(event) {
    event.preventDefault();
    updateLoginStatus('Logging in...', 'loading');
    const formData = { account_name: document.getElementById('account_name').value, username: document.getElementById('username').value, email: document.getElementById('email').value, password: document.getElementById('password').value };
    if (!formData.account_name.trim() || !formData.password.trim() || (!formData.username.trim() && !formData.email.trim())) { updateLoginStatus('<b>Input Error:</b> All fields are required.', 'error'); return; }
    try {
        const response = await fetch('http://127.0.0.1:5000/add_account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
        const result = await response.json();
        if (!response.ok) throw result;
        updateLoginStatus(result.message, 'success');
        document.getElementById('add-account-form').reset();
        loadSavedAccounts();
    } catch (error) {
        const errorMessage = (error && error.error) ? `<b>Server Error:</b> ${error.error}` : `<b>Network Error:</b> Could not reach server.`;
        updateLoginStatus(errorMessage, 'error');
    }
}
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
