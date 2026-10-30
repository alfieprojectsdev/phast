// Settings page (manifest options_ui). The popup or side panel picks up
// changes through chrome.storage.onChanged.

const suffix = document.getElementById('setting-suffix');
const eilBase = document.getElementById('setting-eil-base');

chrome.storage.local.get(['hamSuffix', 'eilBaseUrl'], (res) => {
    suffix.value = res.hamSuffix || '';
    // Left blank when unset, so the placeholder advertises auto-detection.
    // Pre-filling a candidate would silently pin the extension to it.
    eilBase.value = res.eilBaseUrl || '';
});

suffix.addEventListener('input', () => chrome.storage.local.set({ hamSuffix: suffix.value }));
eilBase.addEventListener('input', () => chrome.storage.local.set({ eilBaseUrl: eilBase.value }));
