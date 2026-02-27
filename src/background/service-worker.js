// Background Service Worker

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('PHAST Extension Installed');
});

// Handle messages from Popup or Content Scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        sendResponse({ status: 'pong' });
    }
    return true; // Keep channel open for async responses
});
