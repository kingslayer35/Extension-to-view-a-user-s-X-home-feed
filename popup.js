document.addEventListener('DOMContentLoaded', loadSavedAccounts);

// --- Functions ---
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

// --- Event Listeners ---
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
    const timelineContainer = document.querySelector('div[aria-label*="Timeline: Your Home Timeline"]');
    if (!timelineContainer) {
        alert('Error: Could not find the X.com timeline container. Are you on the home page?');
        return;
    }
    
    let feedHTML = `<h2 style="padding: 1rem; margin:0; text-align: center; color: #e7e9ea;">Displaying Custom Feed for "${accountName}"</h2>`;
    
    if (!tweets || tweets.length === 0) {
        feedHTML += '<p style="text-align: center; padding: 1rem; color: #e7e9ea;">No tweets found in the timeline.</p>';
        timelineContainer.innerHTML = feedHTML;
        return;
    }

    tweets.forEach(tweet => {
        const mediaHTML = tweet.media_urls.length > 0
            ? `<img src="${tweet.media_urls[0]}" style="width: 100%; max-height: 500px; object-fit: cover; border-radius: 16px; margin-top: 12px; border: 1px solid #38444d;">`
            : '';

        feedHTML += `
            <article style="border-bottom: 1px solid #38444d; padding: 1rem; display: flex; flex-direction: column;">
                <div style="display: flex; align-items: flex-start;">
                    <img src="${tweet.user.profile_image_url_https}" style="width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0;">
                    <div style="margin-left: 12px; line-height: 1.4; width: 100%;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap;">
                            <span style="font-weight: bold; margin: 0; color: #e7e9ea;">${tweet.user.name}</span>
                            <span style="font-weight: normal; color: #71767b; margin-left: 5px;">@${tweet.user.screen_name}</span>
                        </div>
                        <!-- THIS IS THE FIX: Added an explicit 'color' property to the tweet text container -->
                        <div style="margin: 5px 0 0 0; white-space: pre-wrap; word-wrap: break-word; color: #e7e9ea; font-size: 15px;">${tweet.text}</div>
                    </div>
                </div>
                ${mediaHTML}
                <div style="display: flex; justify-content: space-between; align-items:center; color: #71767b; margin-top: 12px; font-size: 13px;">
                    <div>
                        <span>❤️ ${tweet.stats.likes}</span>
                        <span style="margin-left: 1rem;">🔁 ${tweet.stats.retweets}</span>
                        <span style="margin-left: 1rem;">👁️ ${tweet.stats.views}</span>
                    </div>
                    <span>${new Date(tweet.created_at).toLocaleString()}</span>
                </div>
            </article>
        `;
    });
    
    timelineContainer.innerHTML = feedHTML;
}
