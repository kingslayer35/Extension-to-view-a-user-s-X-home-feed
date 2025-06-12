// Background script for the X Feed Viewer extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('X Feed Viewer extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // The popup will handle the UI, this is just for any background tasks
  console.log('Extension icon clicked');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkServerStatus') {
      // Check if the Python server is running
      fetch('http://localhost:5000/health')
          .then(response => response.ok)
          .then(isRunning => sendResponse({ serverRunning: isRunning }))
          .catch(() => sendResponse({ serverRunning: false }));
      return true; // Keep the message channel open for async response
  }
});

// Clean up on extension unload
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending, cleaning up...');
});
