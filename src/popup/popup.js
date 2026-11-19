// Popup Logic
console.log('PHAST Popup Loaded');

import { generateFilenames } from '../lib/filename-generator.js';
import { DecisionEngine } from '../lib/har-engine/engine.js';
import { HAZARD_RULES_SCHEMA } from '../lib/har-engine/rules.js';
import { AssessmentCategory } from '../lib/har-engine/models.js';
import { assessmentFromRow, findCategoryRow, COLUMNS } from '../lib/har-engine/table-row.js';
import { eilVizUrl } from '../lib/eil-handoff.js';
import { panelAction } from '../lib/panel-tab.js';
import { indexMunicipalities, municipalitiesAlong, formatTraversed, mentionsUnnamedFault, unnamedFaultStatus } from '../lib/fault-lgus.js';
import { reportStatements, planSelection, volcanoName, suggestOrder } from '../lib/recommendations.js';

let _currentMetadata = null;
let _currentFilenames = [];

// This page runs as a popup or as a side panel (see service-worker.js). The
// side panel stays open across tab switches, so it tracks which tab its
// details came from and rescans when the active tab changes.
let _shownTabId = null;
let _panelWindowId = null;
// Bumped by every scan and reset, so a reply from a page the assessor has
// since left can't overwrite what's on screen.
let _scanSeq = 0;
// Bumped by every report and reset, so an unnamed-fault lookup that finishes
// late can't show its suggestion beside a different report.
let _faultLookup = 0;
const SHORT_CROSSING_M = 1000;

// Where the EIL stack is served. eil-calc and eil-viz sit behind one origin:
// `/` is the eil-viz bundle, `/api/` proxies to eil-calc.
//
// The address is mid-migration, so several may work at once. Tried in this
// order, and the first that answers wins — preference order, not a race:
//   1. the DNS name, once MIS creates the A record. Reaches everyone with no
//      client-side setup; the destination this list is migrating toward.
//   2. `gps3` over Tailscale MagicDNS. Follows the host across networks and
//      renumbering, but only resolves on a machine joined to the tailnet with
//      MagicDNS enabled.
//   3. the LAN IP. The one candidate needing no tailnet membership, so it is
//      what an un-enrolled assessor on the PHIVOLCS network falls back to.
//      Breaks if the host is renumbered.
//   4. the raw Tailscale IP (from the tailnet admin console). Stable for the
//      life of gps3's registration and works without MagicDNS, but is
//      reassigned if the machine is removed and re-added to the tailnet.
//
// Ranked (2) above (3) because a name that follows the host outlasts a literal
// address, and Tailscale connects same-subnet peers directly anyway — an
// on-LAN assessor with the tailnet loses nothing by resolving through it.
//
// The two Tailscale entries simply fail their probes on a machine that is not
// enrolled, so the list degrades correctly while assessors are onboarded
// gradually. An explicit Settings value overrides the whole probe.
const DEFAULT_EIL_CANDIDATES = [
    'http://eil.phivolcs.dost.gov.ph',
    'http://gps3:8080',
    'http://192.168.48.98:8080',
    'http://100.86.209.16:8080',
];

const _stripSlash = u => u.trim().replace(/\/+$/, '');

/**
 * Resolve which EIL base URL to use.
 *
 * An explicit Settings value wins outright — if someone typed an address, a
 * silent fallback to a different server would be worse than a clear failure.
 * Otherwise probe the candidates in parallel and take the first that is ready,
 * in preference order rather than whichever wins the race. If none is ready
 * but one answered, return that one so its not-ready reason reaches the user
 * instead of a misleading "cannot reach".
 *
 * @returns {Promise<{base: string|null, health: object|null, tried: string[]}>}
 */
async function _resolveEilBase() {
    const res = await new Promise(resolve =>
        chrome.storage.local.get(['eilBaseUrl'], resolve)
    );
    if (res.eilBaseUrl && res.eilBaseUrl.trim()) {
        const base = _stripSlash(res.eilBaseUrl);
        return { base, health: await _probeEil(base), tried: [] };
    }

    const cands = DEFAULT_EIL_CANDIDATES.map(_stripSlash);
    // 1.5 s each: this runs on every use, and an unreachable name should not
    // stall the popup while the others are still viable.
    const results = await Promise.all(cands.map(c => _probeEil(c, 1500)));
    let idx = results.findIndex(r => r.ready);
    if (idx === -1) idx = results.findIndex(r => r.reachable);
    return idx === -1
        ? { base: null, health: null, tried: cands }
        : { base: cands[idx], health: results[idx], tried: cands };
}

const _escHtml = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

document.addEventListener('DOMContentLoaded', () => {
    // manifest.json is the one place the version is set; the release workflow checks tags against it.
    document.getElementById('app-version').textContent = `v${chrome.runtime.getManifest().version}`;

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

    // Pin the width only when this page really is the toolbar popup, not a
    // side panel (which Chrome's own side panel menu can open too).
    if (chrome.extension.getViews({ type: 'popup' }).includes(window)) {
        document.body.classList.add('as-popup');
    }

    // Initial Data Fetch
    fetchMetadata();

    chrome.windows.getCurrent((win) => { _panelWindowId = win.id; });
    const onTabEvent = (event) => {
        const action = panelAction(_shownTabId, event, _panelWindowId);
        if (action === 'clear') resetView();
        else if (action === 'rescan') rescan();
    };
    chrome.tabs.onActivated.addListener(({ tabId, windowId }) =>
        onTabEvent({ type: 'activated', tabId, windowId }));
    chrome.tabs.onUpdated.addListener((tabId, info, tab) =>
        onTabEvent({ type: 'updated', tabId, windowId: tab.windowId, active: tab.active, status: info.status }));

    // Event Listeners
    document.getElementById('refresh-meta').addEventListener('click', rescan);
    document.getElementById('open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('btn-overlay-map').addEventListener('click', () => injectMapScript('overlayVicinityMap'));
    document.getElementById('btn-import-kml').addEventListener('click', () => injectMapScript('importKML'));
    document.getElementById('btn-check-ulap').addEventListener('click', () => injectMapScript('checkULAP'));
    document.getElementById('btn-parse-coords').addEventListener('click', () => injectMapScript('parseRequestCoords'));

    document.getElementById('btn-send-eil').addEventListener('click', sendToEILViz);
    document.getElementById('btn-gen-report').addEventListener('click', generateReport);

    const reportCategory = document.getElementById('report-category');
    const syncVolcanoOptions = () => {
        document.getElementById('report-volcano-options').style.display =
            reportCategory.value === 'Volcano' ? '' : 'none';
    };
    reportCategory.addEventListener('change', syncVolcanoOptions);
    syncVolcanoOptions();

    // Settings live on the options page. The suffix only changes the filenames,
    // so rebuild those and leave the rest (a generated report, say) alone.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.hamSuffix && _currentMetadata && _shownTabId !== null) {
            fetchHazardsForFilenames(_currentMetadata, changes.hamSuffix.newValue || 'ArP', _shownTabId, _scanSeq);
        }
    });

    // Copy Report Listener
    document.getElementById('btn-select-recs').addEventListener('click', selectRecommendations);
    document.getElementById('btn-open-recs').addEventListener('click', () => {
        if (_recOpenUrl && _shownTabId !== null) chrome.tabs.update(_shownTabId, { url: _recOpenUrl });
    });

    document.getElementById('btn-copy-suggestion').addEventListener('click', () => {
        const btn = document.getElementById('btn-copy-suggestion');
        navigator.clipboard.writeText(btn.dataset.text || '').then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy suggested status', 1500);
        }).catch(err => console.error('Failed to copy suggestion:', err));
    });

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

const META_FIELDS = ['req-id', 'req-loc', 'req-client'];

// Empties everything that belongs to the page last scanned.
function resetView() {
    _scanSeq++;
    _currentMetadata = null;
    _currentFilenames = [];
    for (const id of META_FIELDS) {
        const el = document.getElementById(id);
        el.value = '';
        el.placeholder = 'Scanning...';
    }
    document.getElementById('current-request').textContent = '';
    document.getElementById('filename-list').innerHTML = '<div class="placeholder">No filenames generated yet.</div>';
    document.getElementById('discovery-card').style.display = 'none';
    document.getElementById('report-output').value = '';
    _showReportWarnings([]);
    _clearFaultSuggestion();
    _hideRecommendationsCard();
    _setEILStatus(document.getElementById('eil-status'), '', '');
}

function rescan() {
    resetView();
    fetchMetadata();
}

function showNoRequestPage() {
    for (const id of META_FIELDS) {
        const el = document.getElementById(id);
        el.value = '';
        el.placeholder = 'Not a HAS Admin request page';
    }
    document.getElementById('current-request').textContent = 'No request page';
    document.getElementById('filename-list').innerHTML =
        '<div class="placeholder">Open a HAS Admin request to generate filenames.</div>';
}

function fetchMetadata() {
    const seq = ++_scanSeq;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || seq !== _scanSeq) return;
        _shownTabId = tab.id;
        showRecommendationsCard(tab, seq);

        chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_METADATA' }, (response) => {
            // Reading lastError also keeps Chrome from logging it as unchecked.
            const failed = chrome.runtime.lastError || !response;
            if (seq !== _scanSeq) return;
            if (failed) {
                // No content script answered: not a HAS Admin page, or it hasn't loaded yet.
                showNoRequestPage();
                return;
            }
            handleMetadata(response, tab.id, seq);
            scanAndShowDiscovery(tab.id, seq);
        });
    });
}

function handleMetadata(response, tabId, seq) {
    _currentMetadata = response;
    document.getElementById('req-id').value = response.requestId || 'Not found';
    document.getElementById('req-client').value = response.client || 'Not found';
    document.getElementById('req-loc').value = response.location || 'Not found';
    document.getElementById('current-request').textContent = response.requestId || '';

    chrome.storage.local.get(['hamSuffix'], (res) => {
        const suffix = res.hamSuffix || 'ArP';
        fetchHazardsForFilenames(response, suffix, tabId, seq);
    });
}

function fetchHazardsForFilenames(metadata, suffix, tabId, seq) {
    if (seq !== _scanSeq) return;
    if (metadata.hazardType && metadata.hazardType.length > 0) {
        const filenames = generateFilenames(metadata, suffix);
        renderFilenames(filenames);
        return;
    }

    chrome.tabs.sendMessage(tabId, { action: 'GET_TABLE_DATA' }, (rows) => {
        if (chrome.runtime.lastError || seq !== _scanSeq) return;
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

function scanAndShowDiscovery(tabId, seq) {
    chrome.tabs.sendMessage(tabId, { action: 'SCAN_COORDS' }, (result) => {
        if (chrome.runtime.lastError || seq !== _scanSeq || !result || (!result.coords && !result.kml)) return;
        showDiscoveryCard(result);
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

    const { base, health, tried } = await _resolveEilBase();

    if (!base) {
        btn.disabled = false;
        _setEILStatus(statusEl, 'error', `
            <div class="eil-status-item">
                <strong>⚠ Cannot reach the EIL server</strong>
                <div class="eil-detail">Tried: ${tried.map(t => `<code>${_escHtml(t)}</code>`).join(', ')}</div>
                <div class="eil-detail">Check that you are on the PHIVOLCS network. If the
                server has moved, set its address in <strong>Settings → EIL server URL</strong>.</div>
            </div>`);
        return;
    }

    btn.disabled = false;

    if (health.ready) {
        _setEILStatus(statusEl, '', '');
        // Always a new tab: EIL-Viz reads the parcel only when the page loads.
        window.open(eilVizUrl(base, geoJson), '_blank');
        return;
    }

    // Step 3: not usable — say which of the two failure modes it is. These are
    // server-side problems; nothing the assessor can fix from their own machine.
    const html = health.reachable
        ? `<div class="eil-status-item">
               <strong>⚠ EIL server is not ready</strong>
               <div class="eil-detail">${_escHtml(health.reason || 'Readiness check failed.')}</div>
               <div class="eil-detail">The server at <code>${_escHtml(base)}</code> is running but
               cannot serve assessments. Report this to whoever maintains it.</div>
           </div>`
        : `<div class="eil-status-item">
               <strong>⚠ Cannot reach the EIL server</strong>
               <div class="eil-detail">No response from <code>${_escHtml(base)}</code>.</div>
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

// Shown beside the report, never inside it: the textarea is what gets copied.
function _showReportWarnings(warnings) {
    const el = document.getElementById('report-warnings');
    el.innerHTML = warnings.map(w => `<div class="report-warning">${_escHtml(w)}</div>`).join('');
    el.style.display = warnings.length ? '' : 'none';
}

function generateReport() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // Read the location from this tab now, not _currentMetadata, so the report
        // always matches the page in front even if a rescan is still in flight.
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_PAGE_METADATA' }, (meta) => {
        const siteLocation = (!chrome.runtime.lastError && meta && meta.location) || '';
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_TABLE_DATA' }, (rows) => {
            _showReportWarnings([]);
            _clearFaultSuggestion();
            if (!rows || rows.length === 0) {
                document.getElementById('report-output').value = "Error: No assessment table data found on page.";
                return;
            }

            const catStr = document.getElementById('report-category').value;
            const category = catStr === 'Earthquake' ? AssessmentCategory.EARTHQUAKE : AssessmentCategory.VOLCANO;
            const row = findCategoryRow(rows, category);
            // findCategoryRow falls back to the first row; say so if that row then fails.
            const rowMatched = (row[COLUMNS.category] || '').trim().toLowerCase() === catStr.toLowerCase();

            try {
                const assessment = assessmentFromRow(row, {
                    category,
                    vicinityMapProvided: document.getElementById('report-vicinity-map').checked,
                    outsideWatershed: document.getElementById('report-outside-watershed').checked,
                    isIslandVolcano: document.getElementById('report-island-volcano').checked,
                    avHasHazardMap: !document.getElementById('report-av-no-map').checked,
                    pavHasHazardMap: document.getElementById('report-pav-map').checked,
                    siteLocation,
                });

                const engine = new DecisionEngine(HAZARD_RULES_SCHEMA);
                const harOutput = engine.processAssessment(assessment);
                _showReportWarnings(harOutput.warnings);

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
                    (section.notes || []).forEach(note => { text += `Note: ${note}\n`; });
                    text += "\n";
                });

                text += "[Common Statements]\n";
                harOutput.common_statements.forEach(stmt => {
                    if (stmt.explanation) text += `- ${stmt.explanation}\n`;
                    if (stmt.recommendation) text += `  Rec: ${stmt.recommendation}\n`;
                });
                text += "\n";

                // The boilerplate disclaimers (harOutput.boilerplate) are left out:
                // HAS Admin prints them on every HAR itself, and they can't be edited.
                text += `Supersedes: ${harOutput.supersedes}\n`;

                document.getElementById('report-output').value = text;
                if (category === AssessmentCategory.EARTHQUAKE) {
                    suggestUnnamedFaultPlaces(tabs[0].id, assessment.earthquake.active_fault);
                }
                rememberReportForRecommendations(tabs[0].id, {
                    requestId: (meta && meta.requestId) || '',
                    category: catStr,
                    volcano: category === AssessmentCategory.VOLCANO ? volcanoName(assessment.volcano.nearest_active_volcano) : '',
                    statements: reportStatements(harOutput),
                });

            } catch (e) {
                document.getElementById('report-output').value = "Error: " + e.message +
                    (rowMatched ? "" : `\n\nThe table has no ${catStr} row, so the first row was read instead.`);
                console.error(e);
            }
        });
        });
    });
}

// HAS Admin writes "...of the Unnamed Fault"; the template lists the
// municipalities the fault traverses (src/lib/fault-lgus.js). The page reads
// the fault and the PSA municipalities from HAS Admin's map; this orders and
// formats them. Shown beside the report as a suggestion, never inside it.

function _clearFaultSuggestion() {
    _faultLookup++;
    _showFaultSuggestion('', null);
}

function _showFaultSuggestion(html, copyText) {
    const box = document.getElementById('report-suggestion');
    const btn = document.getElementById('btn-copy-suggestion');
    document.getElementById('report-suggestion-text').innerHTML = html;
    box.style.display = html ? '' : 'none';
    btn.style.display = copyText ? '' : 'none';
    btn.dataset.text = copyText || '';
}

function suggestUnnamedFaultPlaces(tabId, status) {
    if (!mentionsUnnamedFault(status)) return;
    const lookup = ++_faultLookup;
    _showFaultSuggestion('Looking up the municipalities the unnamed fault traverses...', null);

    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => window.PHAST && window.PHAST.unnamedFaultData
            ? window.PHAST.unnamedFaultData()
            : { ok: false, reason: 'PHAST\'s map tools aren\'t loaded on this page yet.' },
    }, (results) => {
        const failed = chrome.runtime.lastError;
        if (lookup !== _faultLookup) return;
        const data = !failed && results && results[0] && results[0].result;
        if (!data || !data.ok) {
            _showFaultSuggestion(`Couldn't list the municipalities the unnamed fault traverses: ${_escHtml(data ? data.reason : 'no answer from the page')} Write them by hand.`, null);
            return;
        }

        const places = municipalitiesAlong(data.line, indexMunicipalities(data.municipalities));
        if (places.length === 0) {
            _showFaultSuggestion('No PSA municipality lies along the unnamed fault (it may be offshore). Write the location by hand.', null);
            return;
        }
        const list = places.map(p =>
            `<li>${_escHtml(p.name)}, ${_escHtml(p.province)}: ${(p.metres / 1000).toFixed(1)} km of the fault` +
            (p.metres < SHORT_CROSSING_M ? ' <strong>(short crossing; check it on the map)</strong>' : '') + '</li>').join('');
        const traversed = formatTraversed(places);
        if (!traversed) {
            _showFaultSuggestion(`The unnamed fault crosses more than one province, so write the list by hand:<ul>${list}</ul>`, null);
            return;
        }
        const suggested = unnamedFaultStatus(status, traversed);
        _showFaultSuggestion(
            'Suggested Active Fault status for the assessment table, listing the municipalities the unnamed fault traverses (north to south, or west to east):' +
            `<div class="suggested-status">${_escHtml(suggested)}</div>` +
            `<ul>${list}</ul>From HAS Admin's PSA Municipality layer. Check it against the map before using it.`,
            suggested);
    });
}

// --- HAS Admin recommendations ---
// Generating a report stores its statements under the assessment ID from the
// request page's speech-bubble link (one per category row). On that
// assessment's recommendation page (Assessment/updateRemarks&id=N) the panel
// then offers to tick the library rows the assessment still needs. It never
// clicks Add, Delete or the Order dropdowns (src/lib/recommendations.js,
// map-handlers.js).
const REC_KEY = id => `recReport:${id}`;
let _recReport = null;
let _recOpenUrl = null;

function assessmentIdOfPage(url) {
    try {
        const u = new URL(url);
        // Only real HAS Admin pages: this URL is also what "Open recommendations page" navigates to.
        if (u.protocol !== 'https:' && u.protocol !== 'file:') return null;
        return u.searchParams.get('r') === 'Assessment/updateRemarks' ? u.searchParams.get('id') : null;
    } catch {
        return null;
    }
}

function runInPage(tabId, func, args) {
    return new Promise(resolve => chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args },
        results => resolve(!chrome.runtime.lastError && results && results[0] ? results[0].result : null)));
}

function _hideRecommendationsCard() {
    _recReport = null;
    _recOpenUrl = null;
    document.getElementById('rec-card').style.display = 'none';
    _showRecResult('');
}

function _showRecommendationsCard({ hint, openUrl = null, report = null }) {
    _recOpenUrl = openUrl;
    _recReport = report;
    document.getElementById('rec-card').style.display = '';
    document.getElementById('rec-hint').textContent = hint;
    document.getElementById('btn-open-recs').style.display = openUrl ? '' : 'none';
    document.getElementById('btn-select-recs').style.display = report ? '' : 'none';
}

function _showRecResult(html) {
    const el = document.getElementById('rec-result');
    el.innerHTML = html;
    el.style.display = html ? '' : 'none';
}

function rememberReportForRecommendations(tabId, report) {
    chrome.tabs.sendMessage(tabId, { action: 'GET_REMARKS_LINKS' }, (links) => {
        if (chrome.runtime.lastError || !Array.isArray(links)) return;
        const link = links.find(l => l.category.toLowerCase() === report.category.toLowerCase());
        if (!link || assessmentIdOfPage(link.url) !== link.assessmentId) return;
        chrome.storage.session.set({ [REC_KEY(link.assessmentId)]: { ...report, assessmentId: link.assessmentId, savedAt: Date.now() } });
        _showRecommendationsCard({
            hint: `PHAST can tick this report's ${report.category} statements on HAS Admin's recommendation page for assessment ${link.assessmentId}.`,
            openUrl: link.url,
        });
    });
}

function showRecommendationsCard(tab, seq) {
    const id = assessmentIdOfPage(tab.url || '');
    if (!id) return;
    chrome.storage.session.get([REC_KEY(id)], (stored) => {
        if (seq !== _scanSeq) return;
        const report = stored[REC_KEY(id)];
        if (!report) {
            _showRecommendationsCard({ hint: `No PHAST report for assessment ${id} yet. Generate the report on its request page, then come back here.` });
            return;
        }
        const time = new Date(report.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        _showRecommendationsCard({
            hint: `Report for request ${report.requestId || '?'} (${report.category}), generated at ${time}. PHAST ticks the statements this assessment doesn't have yet; you check them and click Add Recommendation.`,
            report,
        });
        // The Select button lives in the Report tab; bring it forward on this page.
        document.querySelector('.tab-btn[data-tab="report"]').click();
    });
}

async function selectRecommendations() {
    const report = _recReport;
    const tabId = _shownTabId;
    if (!report || tabId === null) return;
    const seq = _scanSeq;
    const btn = document.getElementById('btn-select-recs');
    btn.disabled = true;
    _showRecResult('Reading HAS Admin\'s recommendation library...');
    try {
        const lib = await runInPage(tabId, (category) => window.PHAST && window.PHAST.recommendationLibrary
            ? window.PHAST.recommendationLibrary(category)
            : { ok: false, reason: 'PHAST\'s page tools aren\'t loaded on this page yet.' }, [report.category]);
        if (seq !== _scanSeq) return;
        if (!lib || !lib.ok) {
            _showRecResult(`Couldn't read the library: ${_escHtml(lib ? lib.reason : 'no answer from the page')}`);
            return;
        }
        if (lib.assessmentId !== report.assessmentId) {
            _showRecResult('This page is for a different assessment than the report. Nothing was ticked.');
            return;
        }

        const plan = planSelection(report.statements, lib.library, lib.selected, report);
        const pageOf = id => (lib.library.find(r => r.id === id) || {}).page;
        const byPage = new Map();
        for (const t of plan.toTick) byPage.set(pageOf(t.id), [...(byPage.get(pageOf(t.id)) || []), t.id]);
        const [page, ids] = [...byPage].sort((a, b) => b[1].length - a[1].length)[0] || [null, []];

        let tickedIds = [];
        if (ids.length) {
            const res = await runInPage(tabId, (c, p, i) => window.PHAST.tickRecommendations(c, p, i), [report.category, page, ids]);
            if (seq !== _scanSeq) return;
            if (!res || !res.ok) {
                _showRecResult(`Couldn't tick the rows: ${_escHtml(res ? res.reason : 'no answer from the page')}`);
                return;
            }
            tickedIds = res.ticked;
        }
        _showRecResult(renderRecommendationPlan(plan, tickedIds, page, report.category) +
            renderSuggestedOrder(suggestOrder(report.statements, lib.selected)));
    } finally {
        btn.disabled = false;
    }
}

function renderRecommendationPlan(plan, tickedIds, page, category) {
    const li = items => `<ul>${items.map(t => `<li>${_escHtml(t)}</li>`).join('')}</ul>`;
    const short = s => s.length > 110 ? s.slice(0, 107) + '...' : s;
    const parts = [];
    const ticked = plan.toTick.filter(t => tickedIds.includes(t.id));
    const later = plan.toTick.filter(t => !tickedIds.includes(t.id));
    if (ticked.length) {
        parts.push(`<strong>Ticked ${ticked.length} row(s) on page ${page} of the ${_escHtml(category)} list.</strong> Check them, then click Add Recommendation.` +
            li(ticked.map(t => short(t.text))));
    }
    if (later.length) {
        parts.push(`${later.length} more are on another page of the library. After adding these, press Select recommendations again.`);
    }
    if (!plan.toTick.length && !plan.near.length && !plan.missing.length) {
        parts.push('The assessment already has every statement in the report.');
    } else if (plan.present.length) {
        parts.push(`${plan.present.length} statement(s) are already on the assessment.`);
    }
    if (plan.near.length) {
        parts.push('<strong>Close, but the library words it differently (not ticked):</strong>' +
            li(plan.near.map(n => `Report: "${short(n.statement)}" / Library: "${short(n.libraryText)}"`)));
    }
    if (plan.missing.length) {
        parts.push('<strong>Not in HAS Admin\'s library:</strong>' + li(plan.missing.map(m => short(m.statement))));
    }
    if (plan.extra.length) {
        parts.push('<strong>On the assessment but not in PHAST\'s report</strong> (delete them yourself if they don\'t belong):' +
            li(plan.extra.map(e => short(e.text))));
    }
    return parts.map(p => `<p>${p}</p>`).join('');
}

// Read-only: the assessor sets each Order dropdown, so every statement gets
// looked at. Statements the report doesn't use are listed last, unnumbered.
function renderSuggestedOrder(order) {
    if (!order.length) return '';
    const short = s => s.length > 90 ? s.slice(0, 87) + '...' : s;
    const rows = order.map(r => {
        const now = r.current === null ? 'no order set' : `now ${r.current}`;
        if (r.suggested === null) return `<li><strong>Not in the report</strong> (${now}): ${_escHtml(short(r.text))}</li>`;
        const differs = r.current !== r.suggested ? ' <strong>(change)</strong>' : '';
        return `<li><strong>${r.suggested}</strong> (${now})${differs}: ${_escHtml(short(r.text))}</li>`;
    }).join('');
    const changes = order.filter(r => r.suggested !== null && r.current !== r.suggested).length;
    return `<p><strong>Suggested order for the assessment's statements</strong> (set the Order dropdowns yourself; each change saves at once). ` +
        `${changes ? `${changes} to change.` : 'All already in order.'} Covers statements already added; after adding more, press Select recommendations again.</p>` +
        `<ul class="suggested-order">${rows}</ul>`;
}
