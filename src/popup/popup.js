// Popup Logic
console.log('PHAST Popup Loaded');

import { generateFilenames } from '../lib/filename-generator.js';
import { DecisionEngine } from '../lib/har-engine/engine.js';
import { HAZARD_RULES_SCHEMA } from '../lib/har-engine/rules.js';
import { Assessment, AssessmentCategory, Coordinate, FeatureType } from '../lib/har-engine/models.js';

let _currentMetadata = null;
let _currentFilenames = [];

// Where the EIL stack is served. eil-calc and eil-viz sit behind one origin:
// `/` is the eil-viz bundle, `/api/` proxies to eil-calc.
//
// Tried in order, most durable first, because the address is mid-migration:
//   1. the DNS name, once MIS creates the A record (survives everything)
//   2. mDNS — works today on clients that resolve .local; survives an IP change
//   3. the raw IP — always works on the LAN, but breaks if the host is renumbered
//
// Whichever answers first is used, so no assessor has to be told to change
// anything as the deployment moves up that list. An explicit setting overrides
// the whole probe.
const DEFAULT_EIL_CANDIDATES = [
    'http://eil.phivolcs.dost.gov.ph',
    'http://gps3.local:8080',
    'http://192.168.48.98:8080',
];

const _stripSlash = u => u.trim().replace(/\/+$/, '');

/**
 * Resolve which EIL base URL to use.
 *
 * An explicit Settings value wins outright — if someone typed an address, a
 * silent fallback to a different server would be worse than a clear failure.
 * Otherwise probe the candidates in parallel and take the first that is ready,
 * in preference order rather than whichever wins the race.
 *
 * @returns {Promise<{base: string|null, tried: string[]}>}
 */
async function _resolveEilBase() {
    const res = await new Promise(resolve =>
        chrome.storage.local.get(['eilBaseUrl'], resolve)
    );
    if (res.eilBaseUrl && res.eilBaseUrl.trim()) {
        return { base: _stripSlash(res.eilBaseUrl), tried: [] };
    }

    const cands = DEFAULT_EIL_CANDIDATES.map(_stripSlash);
    // 1.5 s each: this runs on every use, and an unreachable name should not
    // stall the popup while the others are still viable.
    const results = await Promise.all(cands.map(c => _probeEil(c, 1500)));
    const idx = results.findIndex(r => r.ready);
    return { base: idx === -1 ? null : cands[idx], tried: cands };
}

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

    document.getElementById('btn-send-eil').addEventListener('click', sendToEILViz);
    document.getElementById('btn-gen-report').addEventListener('click', generateReport);

    document.getElementById('setting-suffix').addEventListener('input', (e) => {
        chrome.storage.local.set({ hamSuffix: e.target.value });
        fetchMetadata();
    });

    document.getElementById('setting-eil-base').addEventListener('input', (e) => {
        chrome.storage.local.set({ eilBaseUrl: e.target.value });
    });

    // Load settings
    chrome.storage.local.get(['hamSuffix', 'eilBaseUrl'], (res) => {
        if (res.hamSuffix) document.getElementById('setting-suffix').value = res.hamSuffix;
        // Left blank when unset, so the placeholder advertises auto-detection.
        // Pre-filling a candidate would silently pin the extension to it.
        document.getElementById('setting-eil-base').value = res.eilBaseUrl || '';
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
                if (window.PHAST && typeof window.PHAST[name] === 'function') {
                    window.PHAST[name]();
                } else {
                    alert('PHAST: Map handlers not loaded yet. Try again in a moment.');
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
                    func: (lt, ln) => { if (window.PHAST && window.PHAST.centerMapTo) window.PHAST.centerMapTo(lt, ln); },
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

async function sendToEILViz() {
    const btn = document.getElementById('btn-send-eil');
    const statusEl = document.getElementById('eil-status');

    // Step 1: get drawn GeoJSON from the map page
    const tabs = await new Promise(resolve =>
        chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    );
    if (!tabs[0]) return;

    const results = await new Promise(resolve =>
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            world: 'MAIN',
            func: () => window.PHAST && window.PHAST.getDrawnGeoJSON
                ? window.PHAST.getDrawnGeoJSON()
                : null
        }, resolve)
    );

    if (chrome.runtime.lastError || !results || !results[0] || !results[0].result) {
        alert('PHAST: No drawn polygon found on the map. Draw or import a parcel boundary first.');
        return;
    }

    const geoJson = results[0].result;

    // Step 2: one readiness check. eil-calc and eil-viz share an origin now, so
    // a single probe covers both — and /readyz answers the question that
    // actually matters ("can it assess?"), not just "is a port open".
    _setEILStatus(statusEl, 'checking', 'Locating EIL server…');
    btn.disabled = true;

    const { base, tried } = await _resolveEilBase();

    if (!base) {
        btn.disabled = false;
        const esc0 = s => String(s).replace(/[&<>"]/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        _setEILStatus(statusEl, 'error', `
            <div class="eil-status-item">
                <strong>⚠ Cannot reach the EIL server</strong>
                <div class="eil-detail">Tried: ${tried.map(t => `<code>${esc0(t)}</code>`).join(', ')}</div>
                <div class="eil-detail">Check that you are on the PHIVOLCS network. If the
                server has moved, set its address in <strong>Settings → EIL server URL</strong>.</div>
            </div>`);
        return;
    }

    const health = await _probeEil(base);

    btn.disabled = false;

    if (health.ready) {
        _setEILStatus(statusEl, '', '');
        const encoded = btoa(unescape(encodeURIComponent(geoJson)));
        window.open(`${base}/?geo=${encoded}`, '_blank');
        return;
    }

    // Step 3: not usable — say which of the two failure modes it is. These are
    // server-side problems; nothing the assessor can fix from their own machine.
    const esc = s => String(s).replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const html = health.reachable
        ? `<div class="eil-status-item">
               <strong>⚠ EIL server is not ready</strong>
               <div class="eil-detail">${esc(health.reason || 'Readiness check failed.')}</div>
               <div class="eil-detail">The server at <code>${esc(base)}</code> is running but
               cannot serve assessments. Report this to whoever maintains it.</div>
           </div>`
        : `<div class="eil-status-item">
               <strong>⚠ Cannot reach the EIL server</strong>
               <div class="eil-detail">No response from <code>${esc(base)}</code>.</div>
               <div class="eil-detail">Check that you are on the PHIVOLCS network. If the
               address is wrong, correct it in <strong>Settings → EIL server URL</strong>.</div>
           </div>`;

    _setEILStatus(statusEl, 'error', html);
}

/**
 * Probe the EIL deployment's readiness endpoint.
 *
 * Uses a real (non-opaque) fetch: `host_permissions` covers this origin, so the
 * extension is exempt from CORS and can read the JSON body — which is the point,
 * since /readyz reports *why* it is not ready.
 *
 * @returns {Promise<{reachable: boolean, ready: boolean, reason?: string}>}
 */
async function _probeEil(base, timeoutMs = 3000) {
    try {
        const res = await fetch(`${base}/readyz`, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return { reachable: true, ready: true };

        // 503 carries {"status":"not ready","reason":"..."}; 502 from the proxy
        // means the backend is down behind a running nginx and has no JSON body.
        let reason = `Server responded ${res.status}.`;
        try {
            const body = await res.json();
            if (body && body.reason) reason = body.reason;
        } catch {
            if (res.status === 502 || res.status === 504) {
                reason = 'The assessment API is not running behind the web server.';
            }
        }
        return { reachable: true, ready: false, reason };
    } catch {
        return { reachable: false, ready: false };
    }
}

function _setEILStatus(el, cls, html) {
    el.className = 'eil-status' + (cls ? ` ${cls}` : '');
    el.innerHTML = html;
    el.style.display = html ? '' : 'none';
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
