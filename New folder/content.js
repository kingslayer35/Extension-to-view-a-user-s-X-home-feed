// Content script for X Feed Viewer
// This script runs on x.com and twitter.com pages

(function() {
    'use strict';
    
    // Check if we're on the X/Twitter homepage
    if (window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com')) {
        console.log('X Feed Viewer: Content script loaded on X/Twitter');
        
        // Add a subtle indicator that the extension is active
        const indicator = document.createElement('div');
        indicator.id = 'x-feed-viewer-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #1da1f2;
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 12px;
            z-index: 10000;
            font-family: Arial, sans-serif;
            opacity: 0.8;
        `;
        indicator.textContent = 'X Feed Viewer Active';
        
        // Add to page after a short delay to ensure DOM is ready
        setTimeout(() => {
            document.body.appendChild(indicator);
            
            // Hide the indicator after 3 seconds
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.style.opacity = '0';
                    setTimeout(() => {
                        if (indicator.parentNode) {
                            indicator.parentNode.removeChild(indicator);
                        }
                    }, 500);
                }
            }, 3000);
        }, 1000);
    }
    
    // Listen for messages from the popup or background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'pageInfo') {
            sendResponse({
                url: window.location.href,
                title: document.title,
                isXPage: window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com')
            });
        }
    });
})();
