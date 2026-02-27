// Scraper Content Script
// Runs in ISOLATED world

console.log('PHAST Scraper Loaded');

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_METADATA') {
        const metadata = extractMetadata();
        sendResponse(metadata);
    } else if (request.action === 'GET_TABLE_DATA') {
        const tableData = extractTableData();
        sendResponse(tableData);
    } else if (request.action === 'SCAN_COORDS') {
        sendResponse(scanCoords());
    }
});

function extractMetadata() {
    // Basic extraction primarily for filename generation
    const metadata = {
        requestId: '',
        client: '',
        location: '',
        requestedBy: '',
        rawText: document.body.textContent // Fallback
    };

    // Attempt to scrape relevant fields based on known structure (from ham-filename-extension logic)
    // We can refine this as we port the logic
    // Targeted DOM Extraction (Primary)
    const getTableValue = (label) => {
        // Look for cells (th, td) or labels that look like the key
        const candidates = Array.from(document.querySelectorAll('th, td, label, dt'));

        for (const el of candidates) {
            let text = el.textContent.trim();
            // aggressive normalization: remove colons, whitespace
            // NEW: also normalize inner whitespace to single space
            text = text.replace(/[:\s]+$/, '').replace(/\s+/g, ' ');

            if (text.toLowerCase() === label.toLowerCase()) {
                // Found the label! Look for value.

                // Case 1: Table row (th -> td or td -> td)
                if ((el.tagName === 'TH' || el.tagName === 'TD') && el.nextElementSibling) {
                    return el.nextElementSibling.textContent.trim();
                }

                // Case 2: Label -> Input
                if (el.tagName === 'LABEL') {
                    const id = el.getAttribute('for');
                    if (id) {
                        const input = document.getElementById(id);
                        if (input) return input.value || input.innerText;
                    }
                }
            }
        }
        return null;
    };

    // Fallback Regex (Secondary)
    // We keep this for non-table layouts but make it stricter
    const extractRegex = (label) => {
        const text = document.body.textContent;
        // Match "Label" followed immediately by ":" (optional) and value, 
        // but ensure Label is a whole word constraint if possible, or start of line
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // We use the User's example "Request[tab]123456" -> \s+ covers tabs
        const regex = new RegExp(`${escapedLabel}[:]?\\s+([^\\n\\r]+)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };

    const getValue = (label) => getTableValue(label) || extractRegex(label);

    try {
        // Labels based on User's provided snippet:
        // "Request", "Requested For", "Requested By", "Province, City, Barangay"

        // Note: 'Request' from regex matched 'Detail'. 
        // DOM exact match should fix this as 'Request Detail' != 'Request'.

        metadata.requestId = getValue('Request');
        metadata.client = getValue('Requested For');
        metadata.requestedBy = getValue('Requested By');
        metadata.location = getValue('Province, City, Barangay');

        const rawHazards = getValue('Hazard Type');
        if (rawHazards) {
            metadata.hazardType = rawHazards.split(',').map(h => h.trim());
        }

        // If location is still empty, try "HAR Lot Description, Location" or "Lot Description"
        if (!metadata.location || metadata.location === 'Not found') {
            metadata.location = getValue('HAR Lot Description, Location') || getValue('Other Location Details') || '';
        }

    } catch (e) {
        console.error('Error extracting metadata:', e);
    }

    return metadata;
}

function extractTableData() {
    const table = document.querySelector('#assessment-grid table.items');
    if (!table) return [];

    // Extract rows as arrays of text, respecting current DOM state (edits)
    return Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
    );
}

function scanCoords() {
    function dmsToDecimal(dms) {
        let parts = dms.trim().match(/(\d+)[°º]?\s*(\d+)?['']?\s*([\d.]+)?[""]?\s*([NSEW])/i);
        if (!parts) return null;
        let deg = parseFloat(parts[1] || 0),
            min = parseFloat(parts[2] || 0),
            sec = parseFloat(parts[3] || 0);
        let dir = parts[4].toUpperCase();
        let dec = deg + (min / 60) + (sec / 3600);
        return /[SW]/.test(dir) ? -dec : dec;
    }

    let remarks = document.querySelectorAll('td:nth-child(3)');
    for (let td of remarks) {
        let text = td.innerText.replace(/\s+/g, ' ').trim();
        let match = text.match(/(\d{1,3}[°º]?\s*\d{1,2}['']?\s*[\d.]+[""]?\s*[NS])[,;\s]+(\d{1,3}[°º]?\s*\d{1,2}['']?\s*[\d.]+[""]?\s*[EW])/i);
        if (match) {
            let lat = dmsToDecimal(match[1]),
                lon = dmsToDecimal(match[2]);
            if (lat !== null && lon !== null) {
                return { coords: { lat, lon }, kml: null };
            }
        }
    }

    let spans = document.querySelectorAll('span.text-primary');
    for (let span of spans) {
        let name = span.innerText.toLowerCase();
        if (name.endsWith('.kmz') || name.endsWith('.kml')) {
            let row = span.closest('tr');
            let dl = row && row.querySelector("a[href*='download'], a[download]");
            if (dl) {
                let url = dl.href.startsWith('http') ? dl.href : location.origin + dl.getAttribute('href');
                return { coords: null, kml: { url, name: span.innerText.trim() } };
            }
        }
    }

    return { coords: null, kml: null };
}

// Phase 1: Auto-scrape on page load — push to session storage
(function autoScrape() {
    try {
        const metadata = extractMetadata();
        chrome.storage.session.set({ pageMetadata: metadata }, () => {
            if (chrome.runtime.lastError) {
                console.warn('PHAST: Could not save metadata to session storage:', chrome.runtime.lastError.message);
            } else {
                console.log('PHAST: Metadata auto-scraped and cached');
            }
        });
    } catch (e) {
        console.error('PHAST: Auto-scrape failed:', e);
    }
})();
