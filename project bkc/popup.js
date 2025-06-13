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
    statusDiv.className = `status ${type}`; // Ensure 'status' class is always present
    statusDiv.style.display = 'block';
}

// --- Event Listeners ---
document.getElementById('add-account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    updateStatus('Processing...', 'loading');

    const account_name = document.getElementById('account_name').value.trim();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    
    // Get cookie values
    const auth_token = document.getElementById('auth_token').value.trim();
    const ct0 = document.getElementById('ct0').value.trim();
    const twid = document.getElementById('twid').value.trim();       // NEW
    const kdt = document.getElementById('kdt').value.trim();         // NEW
    const guest_id = document.getElementById('guest_id').value.trim(); // NEW
    // Add more cookie variables here as you add inputs

    if (!account_name) {
        updateStatus('<b>Input Error:</b> Account Name is required.', 'error');
        return;
    }

    let formData = { account_name: account_name };
    let usingCookies = false;

    // Prioritize cookies if primary ones are provided
    if (auth_token && ct0) {
        formData.cookies = {
            'auth_token': auth_token,
            'ct0': ct0,
        };
        if (twid) formData.cookies['twid'] = twid;
        if (kdt) formData.cookies['kdt'] = kdt;
        if (guest_id) formData.cookies['guest_id'] = guest_id;
        // Add conditions for other new cookies:
        // if (__cf_bm) formData.cookies['__cf_bm'] = __cf_bm; 

        usingCookies = true;
        updateStatus('Using provided cookies to save session...', 'loading');
    } else if (username && email && password) {
        formData.username = username;
        formData.email = email;
        formData.password = password;
        updateStatus('Using username/password to save session...', 'loading');
    } else {
        updateStatus('<b>Input Error:</b> Please provide either username/email/password OR auth_token/ct0 (and ideally others).', 'error');
        return;
    }
    
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


// --- Injected Function (No changes needed here) ---
function displayFeedInPage(tweets, accountName) {
    const timelineContainer = document.querySelector('div[aria-label*="Timeline: Your Home Timeline"]');
    if (!timelineContainer) {
        alert('Error: Could not find the X.com timeline container. Navigate to your home feed or the site layout may have changed.');
        return;
    }
    
    timelineContainer.innerHTML = `<h2 style="padding: 20px; text-align: center; color: #0f1419;">Displaying feed for "${accountName}"</h2>`;
    
    if (tweets.length === 0) {
        timelineContainer.innerHTML += '<p style="text-align: center;">No tweets found in the timeline, or the API structure has changed.</p>';
        return;
    }

    tweets.forEach(tweet => {
        const tweetElement = document.createElement('article');
        tweetElement.style.cssText = 'border-bottom: 1px solid rgb(239, 243, 244); padding: 1rem;';
        
        tweetElement.innerHTML = `
            <div style="display: flex; align-items: flex-start;">
                <img src="${tweet.user.profile_image_url_https}" style="width: 48px; height: 48px; border-radius: 50%;">
                <div style="margin-left: 12px; color: #0f1419; line-height: 1.4;">
                    <p style="font-weight: bold; margin: 0;">${tweet.user.name} <span style="font-weight: normal; color: #536471;">@${tweet.user.screen_name}</span></p>
                    <p style="margin: 5px 0 0 0; white-space: pre-wrap;">${tweet.text}</p>
                </div>
            </div>`;
        timelineContainer.appendChild(tweetElement);
    });
}