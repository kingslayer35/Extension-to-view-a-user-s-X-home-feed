document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    document.getElementById('resetSettings').addEventListener('click', resetSettings);
});

function loadSettings() {
    chrome.storage.sync.get({
        apiTimeout: 10000,
        maxRetries: 3,
        fallbackEnabled: true,
        tweetsPerLoad: 20,
        autoRefresh: 0
    }, (items) => {
        document.getElementById('apiTimeout').value = items.apiTimeout;
        document.getElementById('maxRetries').value = items.maxRetries;
        document.getElementById('fallbackEnabled').checked = items.fallbackEnabled;
        document.getElementById('tweetsPerLoad').value = items.tweetsPerLoad;
        document.getElementById('autoRefresh').value = items.autoRefresh;
    });
}

function saveSettings() {
    const settings = {
        apiTimeout: parseInt(document.getElementById('apiTimeout').value),
        maxRetries: parseInt(document.getElementById('maxRetries').value),
        fallbackEnabled: document.getElementById('fallbackEnabled').checked,
        tweetsPerLoad: parseInt(document.getElementById('tweetsPerLoad').value),
        autoRefresh: parseInt(document.getElementById('autoRefresh').value)
    };

    chrome.storage.sync.set(settings, () => {
        showStatus('Settings saved successfully!', 'success');
    });
}

function resetSettings() {
    const defaults = {
        apiTimeout: 10000,
        maxRetries: 3,
        fallbackEnabled: true,
        tweetsPerLoad: 20,
        autoRefresh: 0
    };

    chrome.storage.sync.set(defaults, () => {
        loadSettings();
        showStatus('Settings reset to defaults!', 'success');
    });
}

function showStatus(message, type) {
    const status = document.getElementById('settingsStatus');
    status.textContent = message;
    status.className = `status ${type}`;
    setTimeout(() => {
        status.textContent = '';
        status.className = 'status';
    }, 3000);
}
