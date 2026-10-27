# PHAST

PHIVOLCS Hazard Assessment Support Tool

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/alfieprojectsdev/phast)
[![Platform](https://img.shields.io/badge/platform-Chrome-green)](https://www.google.com/chrome/)

PHAST is a Chrome extension (Manifest V3) for assessors working in PHIVOLCS HAS Admin. It replaces a set of bookmarklets and manual steps: it reads the request page, builds the hazard assessment map filenames, adds overlay and import tools to the HAS Admin Leaflet map, hands the drawn parcel to EIL-Viz, and drafts Hazard Assessment Report (HAR) text from the assessment table.

## What it does

### Dashboard tab

When a HAS Admin page loads, the content script reads Request, Requested For, Requested By, "Province, City, Barangay" and Hazard Type from the page and caches them for the popup. "Rescan Page" reads them again.

From those fields the popup builds one filename per hazard map (see [Hazards](#hazards) for the codes):

```
{Request}_{code}_{Province}-{City}-Brgy{Barangay}_{Client}-{Requester}_{suffix}
```

The client name is shortened (Corporation to Corp, Department to Dept, and 19 others) and run together in PascalCase. The requester becomes initials plus surname. "Copy All" puts the request ID, hazard types, filenames, client and requester on the clipboard as JSON.

The popup also looks for request coordinates. It takes the first pair of DMS coordinates it finds in a Remarks cell (the third column of any table on the page); failing that, the first KML or KMZ attachment. Coordinates get "Center Map" and "Copy" buttons, an attachment gets "Import to Map".

### Map Tools tab

These buttons call functions that PHAST injects into the page's own JavaScript context, so they work only on a page with the HAS Admin Leaflet map (`map`, `L` and `drawnItems` globals).

- Overlay Vicinity Map finds image and PDF attachments on the request, prefers ones whose name or row mentions "vicinity", "site map" or "location map", and asks you to pick if there's more than one. The overlay can be dragged, scaled, rotated, and stretched along either of its own axes with the edge handles. The control panel has an opacity slider, a blink toggle and nudge buttons. For a PDF, only page 1 is rendered and overlaid.
- Import KML/KMZ fetches every KML and KMZ attached to the request, converts the placemarks to GeoJSON and adds them to the map's drawn layer, so they're also what "Send to EIL-Viz" sends.
- Check Feature in ULAP opens the ULAP portal in a new tab, centred on the coordinates in the first row of the assessment table.
- Copy Coords / KMZ Link centres the map on the first DMS coordinates in a Remarks cell, or if there are none, imports the request's KML/KMZ. Despite the label it doesn't copy anything.

"Send to EIL-Viz" takes the drawn or imported parcel polygon, checks that the EIL server is ready, and opens EIL-Viz with the polygon base64-encoded in a `?geo=` parameter. See [EIL server](#eil-server).

### Report tab

"Generate Report" reads the assessment table as it currently is on the page, including any edits you've made, takes the row whose category matches the selected Earthquake or Volcano option (or the first row, if none does), and runs it through the HAR engine. Tick "Vicinity Map Provided" to get the vicinity-map intro sentence; untick it for the coordinates one.

The engine copies each hazard status from the table verbatim and adds the matching explanation, recommendation and boilerplate. It decides whether a hazard is safe by looking for the word "safe" anywhere in its status. The rules it follows are in [docs/LOGIC_GUIDE.md](docs/LOGIC_GUIDE.md), and [Logic engine: doc-to-code mapping](#logic-engine-doc-to-code-mapping) records where the engine does and doesn't implement them.

### Row clicks

On any HAS Admin table with the `items` class, clicking a row toggles that row's checkbox. Clicks on links, buttons and form fields are left alone.

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/alfieprojectsdev/phast.git
   ```
2. Open `chrome://extensions/` in Chrome.
3. Turn on Developer mode (top right).
4. Click "Load unpacked" and select the repository's root folder.

## Workflow

1. Open a request in HAS Admin. PHAST reads the metadata, builds the filenames, and shows any coordinates or KML/KMZ it found.
2. Correct the assessment table by hand.
3. Use Map Tools to overlay the vicinity map, import boundaries or centre on the request coordinates.
4. Open the Report tab and generate the HAR text. It's built from the table as you left it in step 2, not from the stored database values.

## Hazards

The filename codes come from the page's Hazard Type field. If that field is empty, PHAST searches the assessment table text for hazard names instead. Earthquake codes are only produced when Active Fault is one of the hazards: without it, Liquefaction, EIL and Tsunami get no filename. Volcano codes produce a `VOL` file plus one `VOL-` file each.

| Hazard | Category | Filename code | Report output |
| :--- | :--- | :--- | :--- |
| Active fault | Earthquake | `AF` | Ground Rupture section, with explanation even when Safe |
| Liquefaction | Earthquake | `AF-LIQN` | No section of its own; the status chooses the mitigation sentence |
| Earthquake-induced landslide | Earthquake | `AF-EIL` | Section only when not Safe |
| Tsunami | Earthquake | `AF-TSU` | Section only when not Safe |
| Ground fissure | Earthquake | none | Section whenever the fissure cell has a value |
| Lahar | Volcano | `VOL-LHR` | Section only when not Safe |
| Pyroclastic flow (PDC) | Volcano | `VOL-PF` | Section only when not Safe |
| Base surge | Volcano | `VOL-BS` | Taal only, when not Safe |
| Lava flow | Volcano | `VOL-LF` | Section only when not Safe; skipped for Pinatubo |
| Ballistic projectiles | Volcano | none | Section only when not Safe; skipped for Pinatubo |
| Volcanic tsunami | Volcano | none | Section only when not Safe; skipped for Pinatubo |
| Volcanic fissure | Volcano | none | Section whenever the fissure cell has a value and the site is within 50 km |

Ballistic projectiles and volcanic tsunami are recognised by the table-text search but have no filename code, so they don't produce a file.

## Configuration

Settings are stored in `chrome.storage.local` and persist across sessions.

- Filename Suffix is appended to every filename. Default `ArP`.
- EIL server URL is blank by default, which means auto-detect. See below.

The manifest asks for `activeTab`, `scripting` (to run the map tools in the page), `storage`, `clipboardRead` and `clipboardWrite`. Its host permissions cover HAS Admin, the EIL server candidates, the retired `gps3.local` address (so an older Settings value keeps working) and two local development addresses, which lets the popup read `/readyz` responses without CORS getting in the way. It also lists `https://*.google.com/*`, though nothing under `src/` currently requests a google.com URL.

## EIL server

EIL analysis runs on a shared server; nothing needs to run on your own machine. The server hosts both EIL-Viz ([eil-viz](https://github.com/alfieprojectsdev/eil-viz)) and the assessment API ([eil-calc](https://github.com/alfieprojectsdev/eil-calc)) behind one origin, so PHAST makes one readiness check against `/readyz`. That endpoint reports whether the server can actually run an assessment (for example, whether the DEM is readable). When it answers 503, PHAST shows the server's own reason.

The address is being migrated, so PHAST probes four candidates at the same time, 1.5 seconds each, and uses the first one in this list that's ready:

1. `http://eil.phivolcs.dost.gov.ph`, the DNS name, once MIS creates the record.
2. `http://gps3:8080`, through Tailscale MagicDNS. Resolves only on a machine that's on the tailnet with MagicDNS on.
3. `http://192.168.48.98:8080`, the LAN address. Needs no tailnet, so it's what an assessor on the PHIVOLCS network falls back to.
4. `http://100.86.209.16:8080`, the Tailscale IP. Works on the tailnet without MagicDNS.

Because the order is fixed, the deployment can move up the list without anyone changing a setting. To point PHAST somewhere else (a test instance, or a server that has moved), fill in Settings > EIL server URL. A value there turns auto-detection off completely, so a typo fails with an error instead of quietly using a different server.

If none is ready but one of them answered, PHAST reports that server's not-ready reason. If none of the four answers, you're probably off the PHIVOLCS network and not on the tailnet.

### Running the stack locally (developers)

```
# Terminal 1: eil-calc API
cd packages/eil-calc
uv run uvicorn api:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: eil-viz frontend (proxies /api to the above)
cd packages/eil-viz
npm run dev
```

Then set Settings > EIL server URL to `http://localhost:5173`.

## Development

There's no build step and no `package.json`. Load the folder unpacked, edit, and reload the extension from `chrome://extensions/`.

| Path | Runs in | Does |
| :--- | :--- | :--- |
| `src/popup/` | Extension popup | UI, filename building, EIL probing, report assembly |
| `src/content/scraper.js` | Page, isolated world | Reads metadata, the assessment table and coordinates; answers the popup's messages |
| `src/content/row-click.js` | Page, isolated world | Row-click checkbox toggle |
| `src/inject/leaflet-loader.js` | Page, isolated world | Injects `map-handlers.js` into the page's own context |
| `src/inject/map-handlers.js` | Page, main world | `window.PHAST.*`: overlay, KML import, ULAP, coordinates, GeoJSON export |
| `src/lib/filename-generator.js` | Popup | Filename rules |
| `src/lib/har-engine/` | Popup | `rules.js` (text and thresholds), `models.js`, `engine.js` (decision logic) |
| `src/background/service-worker.js` | Background | Install log and a `PING` responder; nothing else |
| `src/vendor/` | Loaded by `map-handlers.js` | Leaflet.DistortableImage, PDF.js, JSZip. See [src/vendor/README.md](src/vendor/README.md) |

### Tests

```
node --test tests/har-engine.test.mjs
```

33 tests, covering the HAR engine and the shape of `rules.js`. Nothing tests the popup, the scraper or the map handlers. Tested on Node 24.19.

`tests/mock-page.html` is a stand-in HAS Admin page with a Leaflet map and two attachments, for trying the map tools. The content scripts also match `file://` URLs, so open it from disk after turning on "Allow access to file URLs" in the extension's details. It loads Leaflet from unpkg, so it needs internet access. Its table doesn't have the column layout the Report tab reads.

### Assessment table columns

The Report tab reads the assessment table (`#assessment-grid table.items`) by column position:

| Column | Field | Column | Field |
| :--- | :--- | :--- | :--- |
| 0 | Row ID | 9 | Nearest potentially active volcano |
| 1 | Category (Earthquake / Volcano) | 10 | Fissure |
| 3 | Coordinates, `lon,lat` | 11 | Lahar |
| 4 | Active fault | 12 | Pyroclastic flow |
| 5 | Liquefaction | 13 | Base surge |
| 6 | Earthquake-induced landslide | 14 | Lava flow |
| 7 | Tsunami | 15 | Ballistic projectiles |
| 8 | Nearest active volcano | 16 | Volcanic tsunami |

The two volcano cells must read like `Approximately 12.3 km northeast of Taal Volcano` (`km` or `kilometers`). The engine takes the distance and name from that pattern. If the nearest active volcano cell doesn't match, the distance is read as 0 km.

## Logic engine: doc-to-code mapping

The engine in `src/lib/har-engine/` is meant to track two reference documents in `docs/`. When either changes, review the engine locations below.

Most of `rules.js` is text the engine copies into the report. Some of it is reference data the engine never reads: the `conditions` templates of every hazard except the PDZ, `gep_thresholds`, `gmma_ready_conditions`, `ground_shaking.palawan_sulu`, the `trigger` strings, the fissure `special_cases`, and `applies_to` everywhere except base surge. The tables say where that matters.

### docs/LOGIC_GUIDE.md

| LOGIC_GUIDE.md section | Engine location | What the engine does |
| :--- | :--- | :--- |
| Part 1: Universal boilerplate | `rules.js`: `earthquake_rules.common.intro`, `volcano_rules.common.intro`, `*.common.supersedes` | Uses `with_vicinity_map` when "Vicinity Map Provided" is ticked, otherwise `with_coordinates`. The guide's "No Map Provided" sentence isn't in `rules.js`. `with_both`, `barangay`, `municipal` and the `multiple`/`specific` supersedes variants exist but are never chosen |
| Part 2A: Active fault | `earthquake_rules.active_fault` | Status from the table, plus explanation and recommendation, even when Safe |
| Part 2B: EIL | `earthquake_rules.earthquake_induced_landslide` | Section only when the status doesn't contain "safe". `gep_thresholds` isn't read |
| Part 2B: Tsunami | `earthquake_rules.tsunami` | Section only when the status doesn't contain "safe". The `no_data_low_lying_coastal` wording is only there for reference |
| Part 2C: Liquefaction | `earthquake_rules.liquefaction`; `engine.js`: `_isLiqSusceptible()` | No liquefaction section. The status picks the combined ground-shaking-and-liquefaction sentence, or the ground-shaking-only one for "Safe", a blank cell, or "Low Potential" (hardcoded; `gmma_ready_conditions` isn't read) |
| Part 2D: Ground shaking | `earthquake_rules.common.ground_shaking` | Always the `default` sentence. The Palawan/Sulu variant is never chosen |
| Part 3, Step 1: 50 km gatekeeper | `engine.js`: `isDistant` in `processVolcanoAssessment()` | Distant when the nearest active volcano is more than 50 km away or `outside_watershed` is true. A distant report gets the preamble and ashfall statement and no hazard sections. The popup never sets `outside_watershed` |
| Part 3, Step 1: Island exception | `volcano_rules.distance_rules.outside_safe_zone_island` | Used when distant and `is_island_volcano` is true. The popup never sets `is_island_volcano` |
| Part 3, Step 1b: AV vs PAV | `engine.js`: PAV block in `processVolcanoAssessment()` | PAV nearer and both under 50 km: PAV statement plus a VOOD note. PAV under 50 km and AV at 50 km or more: PAV statement only, a case the guide doesn't cover. Otherwise no PAV output |
| Part 3, Step 2: PDZ | `volcano_rules.pdz_danger_zone`; `engine.js`: `_processPdz()` | Radius from `special_cases`, matched as a substring of the volcano name; inside when the distance is under the radius. Pinatubo gets danger-zone wording, Taal the island sentence. A volcano with no listed radius gets `no_pdz_within_10km` when the site is under 10 km |
| Part 3, Step 3: Silent-if-safe hazards | `volcano_rules.lahar`, `pyroclastic_density_current`, `lava_flow`, `ballistic_projectiles`, `volcanic_tsunami` | Section only when the status doesn't contain "safe". Lava flow, ballistic and volcanic tsunami are skipped for Pinatubo and otherwise rendered for any volcano. When the lahar, PDC or lava flow status contains "prone", the PDC recommendation is also added to the common statements |
| Part 3, Step 3: Volcanic tsunami | `volcano_rules.volcanic_tsunami.recommendation` | Recommendation includes the three natural signs, worded "lake/sea". The 11 June 2024 VHAR template in `docs/` words them for lakes only |
| Part 3, Step 4: Ashfall | `volcano_rules.common.ashfall` | Always included |
| Part 4, §1: Taal | `pdz_danger_zone.special_cases.taal`, `volcano_rules.base_surge` | Island PDZ sentence. Base surge section only for volcanoes named in `base_surge.applies_to` (Taal). The Taal fissure reporting note isn't emitted |
| Part 4, §1b: Fissures (Muntinlupa) | `earthquake_rules.fissure`; `engine.js`: `_processEarthquakeFissure()` | Suppressed when `fissure_distance_m` is over 1000 (hardcoded). The popup never sets it, so in practice the section appears whenever the fissure cell has a value. The Muntinlupa reporting note isn't emitted |
| Part 4, §2: Pinatubo | `pdz_danger_zone.conditions.pinatubo_*`; `engine.js`: `isPinatubo` | Danger-zone wording; no lava flow, ballistic or volcanic tsunami sections. Lahar zones 1 to 5 aren't encoded: the zone text in the table is copied as is |
| Part 4, §3: Mayon | `volcano_rules.lahar.conditions` | The Highly/Moderately/Least Prone labels are defined but not read; the status is copied as is |
| Part 4, §4: PAV | `engine.js`: `_getPavStatement()` | Definition sentence, hardcoded in the method. The alluvial-fan lahar warning isn't emitted |

### docs/VOLCANO_HAZARD_STATUS.md

| VOLCANO_HAZARD_STATUS.md section | Engine location | What the engine does |
| :--- | :--- | :--- |
| Part 1: Standard-format volcanoes | none | Reference for assessors; the engine doesn't check map availability |
| Part 1: Legacy-format volcanoes (PDZ radii) | `pdz_danger_zone.special_cases` | Kanlaon, Bulusan and Hibok-Hibok 4 km, Mayon 6 km, Pinatubo 10 km |
| Part 1: No-map volcanoes | none | Not encoded; Bud Dajo, Makaturing and Musuan are treated like any other volcano |
| Part 2: PAV map status | none | The engine uses whatever status the assessor enters |
| Part 3: Inclusion rules, VTS | `volcanic_tsunami.applies_to` (Taal, Iriga) | Declared but not checked. Only the Pinatubo skip applies |
| Part 3: Inclusion rules, BP | `ballistic_projectiles.applies_to` (Hibok-Hibok, Taal) | Declared but not checked. The list also contradicts Part 3, which requires BP for all active volcanoes; current behaviour (any volcano except Pinatubo) matches Part 3 |
| Part 3: Inclusion rules, BS | `base_surge.applies_to` (Taal) | Checked |
| Part 3: Inclusion rules, VFI | `volcano_rules.fissure` | No `applies_to`; rendered for any volcano within 50 km when the fissure cell has a value |
| Part 4: PDZ formatting | `pdz_danger_zone.conditions` | Pinatubo, Taal and no-PDZ phrasing as in the LOGIC_GUIDE Step 2 row above |
| Part 5: Pinatubo | `engine.js`: `isPinatubo` | Skips lava flow, ballistic and volcanic tsunami; lahar zones not encoded |
| Part 5: Taal | `pdz_danger_zone.special_cases.taal`, `base_surge` | Island PDZ sentence and base surge section. The fissure reporting note isn't emitted |

### Model fields with no popup input

These fields drive documented rules, and the tests set them, but the Report tab has no control for them and `generateReport()` never sets them. Until it does, the rules they gate don't apply to reports generated from the popup.

| Field | Model | Rule it gates |
| :--- | :--- | :--- |
| `fissure_distance_m` | `EarthquakeAssessment` | 1 km fissure trigger (Taal, Muntinlupa) |
| `outside_watershed` | `VolcanoAssessment` | Distant gatekeeper regardless of distance |
| `is_island_volcano` | `VolcanoAssessment` | Shorter island text for distant sites |

---

Internal tool for PHIVOLCS HAS Admin use.
