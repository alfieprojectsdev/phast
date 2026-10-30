// Background Service Worker

// Side panel where the browser has one. setPanelBehavior arrived in Chrome
// 116; on anything older, or a browser without chrome.sidePanel, the
// manifest's popup stays and the toolbar button opens that instead. The two
// show the same page.
function configureActionSurface() {
    if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
    // A declared popup wins over openPanelOnActionClick, so clear it first.
    chrome.action.setPopup({ popup: '' });
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch(err => console.warn('PHAST: could not set side panel behaviour:', err));
}

// Runs every time the worker starts. The onStartup listener is what wakes
// the worker when the browser launches, so the popup override is in place
// before the first click.
configureActionSurface();
chrome.runtime.onStartup.addListener(configureActionSurface);

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('PHAST Extension Installed');
    configureActionSurface();
});

// Handle messages from Popup or Content Scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        sendResponse({ status: 'pong' });
    }
    return true; // Keep channel open for async responses
});
