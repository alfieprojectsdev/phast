# 🌋 PHAST
**PHIVOLCS Hazard Assessment Support Tool**

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/alfieprojectsdev/phat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Chrome-green)](https://www.google.com/chrome/)

**PHAST** is a Chrome Extension that consolidates the bulk of geohazard assessment workflow into a single, cohesive interface. It replaces the fragmented collection of bookmarklets and manual steps with one integrated support tool.

## 🚀 Key Features

### 1. The Dashboard (Command Center)
* **Auto-Scraping:** Instantly captures Request ID, Client, and Location metadata upon page load.
* **Smart Filenaming:** Automatically generates standardized filenames based on the hazard types detected in the request.
* **Coordinate & KML Discovery:** Surfaces any DMS coordinates or KML/KMZ files found on the page with one-click map actions.
* **Data Portability:** One-click JSON export of all request metadata.

### 2. Advanced Map Tools
Injects professional GIS controls directly into the HAS Admin Leaflet map:
* **Vicinity Overlays:** Drag, scale, rotate, and stretch vicinity maps onto the base map. Edge handles allow independent H/V stretching along the image's own axis. Precision opacity slider, blink comparison tool, and nudge controls included.
* **KML/KMZ Import:** Load boundary files directly onto the assessment map.
* **ULAP Validation:** Instant boundary checks against ULAP features.
* **Coordinate Navigation:** Parse DMS coordinates from request remarks and center the map instantly.

### 3. EIL Analysis Integration

Sends the drawn parcel boundary directly to the local [EIL-Viz](https://github.com/alfieprojectsdev/eil-viz) / [EIL-Calc](https://github.com/alfieprojectsdev/eil-calc) stack for slope stability and depositional hazard analysis:

* **Server health check:** Before opening EIL-Viz, PHAST probes the server's `/readyz` endpoint. Because eil-calc and eil-viz are served from a single origin, this is one check rather than two — and it reports whether the server can actually *assess* (is the DEM readable?), not merely whether a port is open. A 503 is surfaced with the server's own reason.
* **Automatic polygon handoff:** The drawn parcel polygon is extracted from the map, base64-encoded, and passed to EIL-Viz as a `?geo=` query parameter.

### 4. The Logic Engine (HAR Generator)
A standardized reporting engine that eliminates guesswork:
* **Earthquake & Volcano Logic:** Applies official PHIVOLCS logic rules to generate compliant text.
* **Live Table Reading:** Reads the *current* state of your assessment table (including manual edits) to ensure reports match your findings.
* **Documentation:** See the [Manual Logic Guide](docs/LOGIC_GUIDE.md) for the ruleset used by the engine.

---

## 🛠️ Installation

1.  Clone this repository:
    ```bash
    git clone https://github.com/alfieprojectsdev/phat.git
    ```
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (top-right toggle).
4.  Click **Load unpacked**.
5.  Select the root folder of this repository.

## ⚡ Workflow

PHAST is designed for a **human-in-the-loop** workflow:

1.  **Scan:** Open a request. PHAST scrapes metadata, pre-calculates filenames, and flags any coordinates or KML files discovered on the page.
2.  **Verify:** Edit the assessment table manually to remove false positives.
3.  **Analyze:** Use the **Map Tools** to overlay vicinity maps, import KML boundaries, or center the map on request coordinates.
4.  **Generate:** Open the **Report** tab to generate the final HAR text. *Note: The engine reads your finalized/edited table, not the raw database values.*

## 🧩 Supported Hazards

| Category | Hazards Detected |
| :--- | :--- |
| **Earthquake** | Active Fault, Liquefaction, EIL, Tsunami, Ground Fissure |
| **Volcano** | Lahar, Pyroclastic Flow, Base Surge, Lava Flow, Ballistics, Volcanic Tsunami |

## 🔧 Configuration

* **Filename Suffix:** Customizable in Settings (default: `ArP`). Persists across sessions.
* **EIL server URL:** Auto-detected; leave blank in Settings unless the deployment moves. See below.
* **Permissions:** Requires `Active Tab` (for injection), `Storage` (for settings), `Clipboard`, and `host_permissions` for the EIL server hosts (needed to probe `/readyz` from the popup).

## ⛰️ EIL Analysis — where the server lives

EIL analysis runs on a **shared server**, not on your own machine. You do not need to start
anything locally.

PHAST finds it automatically, trying these in order and using the first that responds:

1. `http://eil.phivolcs.dost.gov.ph` — the DNS name, once created
2. `http://gps3.local:8080` — mDNS; works on clients that resolve `.local`
3. `http://192.168.48.98:8080` — the raw LAN address; always works on the network

That ordering means the address can move up the list without anyone reconfiguring anything.
If you need to override it — a test instance, or a relocated deployment — set
**Settings → EIL server URL**. An explicit value disables auto-detection entirely, so a typo
fails visibly instead of silently falling back to a different server.

If none respond, you are most likely off the PHIVOLCS network.

### Running the stack locally (developers only)

```bash
# Terminal 1 — eil-calc API
cd packages/eil-calc && uv run uvicorn api:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — eil-viz frontend (proxies /api to the above)
cd packages/eil-viz && npm run dev
```

Then set **Settings → EIL server URL** to `http://localhost:5173`.

---

## 📐 Logic Engine — Doc-to-Code Mapping

The HAR engine (`src/lib/har-engine/`) is kept in sync with two human-readable reference documents in `docs/`. When either document is updated, the corresponding engine locations must be reviewed.

### `docs/LOGIC_GUIDE.md` → Engine

| LOGIC_GUIDE.md section | Engine location | What it governs |
| :--- | :--- | :--- |
| Part 1 — Universal Boilerplate | `rules.js` → `earthquake_rules.common.intro`, `volcano_rules.common.intro`, `common.supersedes` | Intro and supersedes statement templates |
| Part 2A — Active Fault | `rules.js` → `earthquake_rules.active_fault` | Status templates, explanation, recommendation, 5 m buffer policy |
| Part 2B — EIL | `rules.js` → `earthquake_rules.earthquake_induced_landslide` | Conditions, explanation, recommendation; GEP thresholds in `gep_thresholds` sub-object |
| Part 2B — Tsunami | `rules.js` → `earthquake_rules.tsunami.conditions` | `prone`, `low_lying_coastal_ew`, `no_data_low_lying_coastal` (no-map coastal fallback) |
| Part 2C — Liquefaction | `rules.js` → `earthquake_rules.liquefaction` | Standard conditions; GMMA-READY terminology in `gmma_ready_conditions`; `_isLiqSusceptible()` in `engine.js` controls mitigation text selection |
| Part 2D — Ground Shaking | `rules.js` → `earthquake_rules.common.ground_shaking` | Default and Palawan/Sulu variants |
| Part 3, Step 1 — 50 km Gatekeeper | `engine.js` → `processVolcanoAssessment()` line: `isDistant` | Combines `distanceKm > 50` with `outside_watershed` flag from `models.js:VolcanoAssessment` |
| Part 3, Step 1 — Island Exception | `rules.js` → `volcano_rules.distance_rules.outside_safe_zone_island`; `engine.js` → `is_island_volcano` branch | Shorter "erupted products" text for Biliran, Hibok-Hibok, etc. |
| Part 3, Step 1b — AV vs PAV Conflict | `engine.js` → PAV block in `processVolcanoAssessment()` | Parses PAV distance via `_parseVolcanoText()`; VOOD note injected when PAV is nearer |
| Part 3, Step 2 — PDZ Check | `rules.js` → `volcano_rules.pdz_danger_zone`; `engine.js` → `_processPdz()` | Radius lookup, Pinatubo/Taal special cases, `no_pdz_within_10km` fallback |
| Part 3, Step 3 — Volcano Silent-if-Safe | `rules.js` → `volcano_rules.lahar`, `pyroclastic_density_current`, `lava_flow`, `ballistic_projectiles`, `volcanic_tsunami` | Explanation and recommendation strings; `policy.show_explanation_if_safe` flag |
| Part 3, Step 3 — Volcanic Tsunami | `rules.js` → `volcano_rules.volcanic_tsunami.recommendation` | Includes three natural tsunami signs |
| Part 3, Step 4 — Ashfall | `rules.js` → `volcano_rules.common.ashfall` | Universal ashfall template |
| Part 4, §1 — Taal | `rules.js` → `volcano_rules.pdz_danger_zone.special_cases.taal`, `volcano_rules.base_surge` | PDZ island text, base surge applies_to |
| Part 4, §1b — Fissures (Muntinlupa) | `rules.js` → `earthquake_rules.fissure.trigger`; `engine.js` → `_processEarthquakeFissure()` | 1 km trigger enforced via `fissure_distance_m` in `models.js:EarthquakeAssessment` |
| Part 4, §2 — Pinatubo | `rules.js` → `volcano_rules.pdz_danger_zone.conditions.pinatubo_*`; `engine.js` → `isPinatubo` guard | "10-kilometer danger zone" phrasing; lahar zone (1–5) system |
| Part 4, §3 — Mayon | `rules.js` → `volcano_rules.lahar.conditions` | Highly/Moderately/Least Prone category labels |
| Part 4, §4 — PAV definition | `engine.js` → `_getPavStatement()` | PAV boilerplate text (hardcoded in method body) |

### `docs/VOLCANO_HAZARD_STATUS.md` → Engine

| VOLCANO_HAZARD_STATUS.md section | Engine location | What it governs |
| :--- | :--- | :--- |
| Part 1 — Standard-Format Volcanoes | No engine code — assessor reference only | Which AVs have current maps; engine does not gate on map availability |
| Part 1 — Legacy-Format Volcanoes (PDZ radii) | `rules.js` → `volcano_rules.pdz_danger_zone.special_cases` | Kanlaon/Bulusan/Hibok-Hibok = 4 km, Mayon = 6 km, Pinatubo = 10 km |
| Part 1 — No-Map Volcanoes (ETR) | No engine code — assessor reference only | Bud Dajo, Makaturing, Musuan: defer assessment; not encoded in engine |
| Part 2 — PAV map status (Mahagnao, Apo) | No engine code — assessor reference only | Engine processes whatever status the assessor enters |
| Part 3 — NVTA Inclusion Rules (VTS) | `rules.js` → `volcano_rules.volcanic_tsunami.applies_to`; `engine.js` → `_processVolcanicTsunami()` and Pinatubo guard | VTS rendered only for applicable volcanoes |
| Part 3 — NVTA Inclusion Rules (BS, VFI) | `rules.js` → `volcano_rules.base_surge.applies_to`, `volcano_rules.fissure` | Taal-specific hazards |
| Part 4 — PDZ Formatting Rules | `rules.js` → `volcano_rules.pdz_danger_zone.conditions` (pinatubo_*, taal special_case, no_pdz_within_10km) | Exact phrases enforced via schema; engine selects by volcano name match |
| Part 5 — Pinatubo special rules | `engine.js` → `isPinatubo` guard; `rules.js` → `pdz_danger_zone.conditions.pinatubo_*` | Skips LV, BP, VTS for Pinatubo; uses lahar zone 1–5 conditions |
| Part 5 — Taal special rules | `rules.js` → `pdz_danger_zone.special_cases.taal`, `base_surge`, `volcanic_tsunami.applies_to` | Island PDZ text; base surge and fissure sections activated |

### Key Model Fields

| Field | Model | Purpose |
| :--- | :--- | :--- |
| `fissure_distance_m` | `EarthquakeAssessment` | Enforces 1 km fissure trigger (Taal, Muntinlupa) |
| `outside_watershed` | `VolcanoAssessment` | Activates distant gatekeeper regardless of km distance |
| `is_island_volcano` | `VolcanoAssessment` | Selects shorter island-exception text when site is distant |

---

*Internal Tool — For PHIVOLCS HAS Admin Use Only.*
