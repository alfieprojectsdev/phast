// src/lib/panel-tab.js
// Decides when the side panel must rescan. Kept out of popup.js so the rules
// can be tested without a browser.
//
// A popup starts fresh every time it opens. The side panel stays open while
// the assessor switches tabs or the page navigates, so what it shows can
// belong to a page that's no longer in front. Showing request A's filenames
// while request B is open would produce wrong HAM filenames.

/**
 * What the panel should do after a tab event in its window.
 *
 * @param {number|null} shownTabId  Tab whose details the panel shows now
 * @param {object} event
 * @param {'activated'|'updated'} event.type
 * @param {number} event.tabId
 * @param {number} event.windowId
 * @param {boolean} [event.active]  updated only: the tab is the window's active tab
 * @param {string} [event.status]   updated only: 'loading' or 'complete'
 * @param {number|null} panelWindowId  Window the panel belongs to
 * @returns {'ignore'|'clear'|'rescan'}
 */
export function panelAction(shownTabId, event, panelWindowId) {
    if (panelWindowId === null || event.windowId !== panelWindowId) return 'ignore';

    if (event.type === 'activated') {
        return event.tabId === shownTabId ? 'ignore' : 'rescan';
    }

    if (event.type === 'updated' && event.active) {
        // Clear as soon as the page starts changing, so nothing from the old
        // page is on screen while the new one loads; scan once it's done.
        if (event.status === 'loading') return 'clear';
        if (event.status === 'complete') return 'rescan';
    }
    return 'ignore';
}
