// Popup Logic
console.log('PHAT Popup Loaded');

import { generateFilenames } from '../lib/filename-generator.js';
import { DecisionEngine } from '../lib/har-engine/engine.js';
import { HAZARD_RULES_SCHEMA } from '../lib/har-engine/rules.js';
import { Assessment, AssessmentCategory, Coordinate, FeatureType } from '../lib/har-engine/models.js';

let _currentMetadata = null;
let _currentFilenames = [];

document.addEventListener('DOMContentLoaded', () => {
    // Tab Navigation
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Initial Data Fetch
    fetchMetadata();

    // Event Listeners
    document.getElementById('refresh-meta').addEventListener('click', fetchMetadata);
    document.getElementById('btn-overlay-map').addEventListener('click', () => injectMapScript('overlayVicinityMap'));
    document.getElementById('btn-import-kml').addEventListener('click', () => injectMapScript('importKML'));
    document.getElementById('btn-check-ulap').addEventListener('click', () => injectMapScript('checkULAP'));
    document.getElementById('btn-parse-coords').addEventListener('click', () => injectMapScript('parseRequestCoords'));

    document.getElementById('btn-gen-report').addEventListener('click', generateReport);

    document.getElementById('setting-suffix').addEventListener('input', (e) => {
        chrome.storage.local.set({ hamSuffix: e.target.value });
        fetchMetadata();
    });

    // Load settings
    chrome.storage.local.get(['hamSuffix'], (res) => {
        if (res.hamSuffix) document.getElementById('setting-suffix').value = res.hamSuffix;
    });

    // Copy Report Listener
    document.getElementById('btn-copy-report').addEventListener('click', () => {
        const reportText = document.getElementById('report-output').value;
        if (!reportText || reportText.startsWith('Error:')) return;
        navigator.clipboard.writeText(reportText).then(() => {
            const btn = document.getElementById('btn-copy-report');
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy to Clipboard', 1500);
        }).catch(err => {
            console.error('Failed to copy report:', err);
        });
    });

    // Copy Listener
    document.getElementById('copy-filenames').addEventListener('click', () => {
        if (!_currentMetadata) return;

        const clipboardData = {
            "Request": _currentMetadata.requestId,
            "Hazard Type": _currentMetadata.hazardType || [],
            "Hazard Assessment Map filenames": _currentFilenames,
            "Requested For": _currentMetadata.client,
            "Requested By": _currentMetadata.requestedBy
        };

        navigator.clipboard.writeText(JSON.stringify(clipboardData, null, 2)).then(() => {
            const btn = document.getElementById('copy-filenames');
            btn.textContent = 'JSON Copied!';
            setTimeout(() => btn.textContent = 'Copy All', 1500);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard');
        });
    });
});

function fetchMetadata() {
    // Try session storage first (instant, from auto-scrape)
    chrome.storage.session.get(['pageMetadata'], (stored) => {
        if (stored.pageMetadata && stored.pageMetadata.requestId) {
            handleMetadata(stored.pageMetadata);
            scanAndShowDiscovery();
            return;
        }

        // Fallback: message the content script directly
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;

            chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_PAGE_METADATA' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('Could not connect to content script:', chrome.runtime.lastError.message);
                    document.getElementById('req-id').placeholder = 'Error connecting...';
                    return;
                }

                if (response) {
                    handleMetadata(response);
                    scanAndShowDiscovery();
                }
            });
        });
    });
}

function handleMetadata(response) {
    _currentMetadata = response;
    document.getElementById('req-id').value = response.requestId || 'Not found';
    document.getElementById('req-client').value = response.client || 'Not found';
    document.getElementById('req-loc').value = response.location || 'Not found';

    chrome.storage.local.get(['hamSuffix'], (res) => {
        const suffix = res.hamSuffix || 'ArP';
        fetchHazardsForFilenames(response, suffix);
    });
}

function fetchHazardsForFilenames(metadata, suffix) {
    if (metadata.hazardType && metadata.hazardType.length > 0) {
        const filenames = generateFilenames(metadata, suffix);
        renderFilenames(filenames);
        return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_TABLE_DATA' }, (rows) => {
            const text = rows ? rows.map(r => r.join(' ')).join(' ') : "";
            const hazards = [];
            if (text.match(/active fault/i)) hazards.push('Active Fault');
            if (text.match(/liquefaction/i)) hazards.push('Liquefaction');
            if (text.match(/landslide/i)) hazards.push('Landslide - Earthquake - Induced');
            if (text.match(/tsunami/i) && !text.match(/volcanic tsunami/i)) hazards.push('Tsunami');
            if (text.match(/lahar/i)) hazards.push('Lahar');
            if (text.match(/pyroclastic/i)) hazards.push('Pyroclastic Flow');
            if (text.match(/base surge/i)) hazards.push('Base Surge');
            if (text.match(/lava flow/i)) hazards.push('Lava Flow');
            if (text.match(/ballistic/i)) hazards.push('Ballistic Projectiles');
            if (text.match(/volcanic tsunami/i)) hazards.push('Volcanic Tsunami');

            metadata.hazardType = hazards;
            const filenames = generateFilenames(metadata, suffix);
            renderFilenames(filenames);
        });
    });
}

function renderFilenames(filenames) {
    _currentFilenames = filenames;
    const list = document.getElementById('filename-list');
    if (filenames.length > 0) {
        list.innerHTML = filenames.map(f => `<div class="filename-item">${f}</div>`).join('');
    } else {
        list.innerHTML = '<div class="placeholder">No hazards detected for filenames.</div>';
    }
}

function injectMapScript(fnName) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;

        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            world: 'MAIN',
            func: (name) => {
                if (window.PHAT && typeof window.PHAT[name] === 'function') {
                    window.PHAT[name]();
                } else {
                    alert('PHAT: Map handlers not loaded yet. Try again in a moment.');
                }
            },
            args: [fnName]
        });
    });
}

function scanAndShowDiscovery() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'SCAN_COORDS' }, (result) => {
            if (chrome.runtime.lastError || !result || (!result.coords && !result.kml)) return;
            showDiscoveryCard(result);
        });
    });
}

function showDiscoveryCard(result) {
    const card = document.getElementById('discovery-card');
    const content = document.getElementById('discovery-content');
    const actions = document.getElementById('discovery-actions');
    card.style.display = '';

    if (result.coords) {
        const { lat, lon } = result.coords;
        content.textContent = `📍 ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`;
        actions.innerHTML = `
            <button class="primary-btn" id="disc-center">Center Map</button>
            <button class="secondary-btn" id="disc-copy-coords">Copy</button>
        `;
        document.getElementById('disc-center').addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return;
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    world: 'MAIN',
                    func: (lt, ln) => { if (window.PHAT && window.PHAT.centerMapTo) window.PHAT.centerMapTo(lt, ln); },
                    args: [lat, lon]
                });
            });
        });
        document.getElementById('disc-copy-coords').addEventListener('click', () => {
            navigator.clipboard.writeText(`${lat}, ${lon}`).catch(() => {});
        });
    } else if (result.kml) {
        content.textContent = `📂 ${result.kml.name}`;
        actions.innerHTML = `<button class="primary-btn" id="disc-import">Import to Map</button>`;
        document.getElementById('disc-import').addEventListener('click', () => injectMapScript('importKML'));
    }
}

function generateReport() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_TABLE_DATA' }, (rows) => {
            if (!rows || rows.length === 0) {
                document.getElementById('report-output').value = "Error: No assessment table data found on page.";
                return;
            }

            const catStr = document.getElementById('report-category').value;
            const category = catStr === 'Earthquake' ? AssessmentCategory.EARTHQUAKE : AssessmentCategory.VOLCANO;
            const vicinityMap = document.getElementById('report-vicinity-map').checked;

            // Find row matching selected category
            let targetRow = rows.find(parts => {
                return parts[1] && parts[1].trim().toLowerCase() === catStr.toLowerCase();
            });
            if (!targetRow) targetRow = rows[0];

            const parts = targetRow;
            let earthquakeData = null;
            let volcanoData = null;

            const coordsStr = parts[3] ? parts[3].trim() : "0,0";

            if (category === AssessmentCategory.EARTHQUAKE) {
                earthquakeData = {
                    active_fault: parts[4] ? parts[4].trim() : "--",
                    liquefaction: parts[5] ? parts[5].trim() : "--",
                    landslide: parts[6] ? parts[6].trim() : "--",
                    tsunami: parts[7] ? parts[7].trim() : "--",
                    fissure: parts[10] ? parts[10].trim() : "--"
                };
            } else {
                volcanoData = {
                    nearest_active_volcano: parts[8] ? parts[8].trim() : "--",
                    nearest_pav: parts[9] ? parts[9].trim() : "--",
                    fissure: parts[10] ? parts[10].trim() : "--",
                    lahar: parts[11] ? parts[11].trim() : "--",
                    pyroclastic_flow: parts[12] ? parts[12].trim() : "--",
                    base_surge: parts[13] ? parts[13].trim() : "--",
                    lava_flow: parts[14] ? parts[14].trim() : "--",
                    ballistic_projectile: parts[15] ? parts[15].trim() : "--",
                    volcanic_tsunami: parts[16] ? parts[16].trim() : "--"
                };
            }

            try {
                const assessment = new Assessment({
                    id: parts[0] || "1",
                    category: category,
                    feature_type: FeatureType.POINT,
                    location: Coordinate.fromString(coordsStr),
                    vicinity_map_provided: vicinityMap,
                    earthquake: earthquakeData,
                    volcano: volcanoData
                });

                const engine = new DecisionEngine(HAZARD_RULES_SCHEMA);
                const harOutput = engine.processAssessment(assessment);

                let text = "";
                text += `Category: ${harOutput.category}\n\n`;
                text += `Intro: ${harOutput.intro}\n\n`;

                harOutput.sections.forEach((section) => {
                    text += `[${section.heading}]\n`;
                    text += `Assessment: ${section.assessment}\n`;
                    if (section.explanation_recommendation) {
                        if (section.explanation_recommendation.explanation) {
                            text += `Explanation: ${section.explanation_recommendation.explanation}\n`;
                        }
                        if (section.explanation_recommendation.recommendation) {
                            text += `Recommendation: ${section.explanation_recommendation.recommendation}\n`;
                        }
                    }
                    text += "\n";
                });

                text += "[Common Statements]\n";
                harOutput.common_statements.forEach(stmt => {
                    if (stmt.explanation) text += `- ${stmt.explanation}\n`;
                    if (stmt.recommendation) text += `  Rec: ${stmt.recommendation}\n`;
                });
                text += "\n";

                text += `Supersedes: ${harOutput.supersedes}\n\n`;

                if (harOutput.boilerplate && Object.keys(harOutput.boilerplate).length > 0) {
                    text += "[Disclaimers]\n";
                    for (const key in harOutput.boilerplate) {
                        text += `- ${harOutput.boilerplate[key]}\n`;
                    }
                }

                document.getElementById('report-output').value = text;

            } catch (e) {
                document.getElementById('report-output').value = "Error: " + e.message;
                console.error(e);
            }
        });
    });
}
