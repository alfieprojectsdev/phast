# PHAST

PHIVOLCS Hazard Assessment Support Tool

[![Release](https://img.shields.io/github/v/release/alfieprojectsdev/phast)](https://github.com/alfieprojectsdev/phast/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Chrome-green)](https://www.google.com/chrome/)

PHAST is a Chrome extension (Manifest V3) for assessors working in PHIVOLCS HAS Admin. It replaces a set of bookmarklets and manual steps: it reads the request page, builds the hazard assessment map filenames, adds overlay and import tools to the HAS Admin Leaflet map, hands the drawn parcel to EIL-Viz, and drafts Hazard Assessment Report (HAR) text from the assessment table.

## What it does

Clicking PHAST's toolbar icon opens it in Chrome's side panel, which stays open while you work on the page and survives clicks elsewhere. It follows the tab you're on: switch to another request, or let the page reload, and it clears what it showed and scans the new page, so filenames and report text always belong to the request in front of you. The header shows which request that is. Chrome before 116, and any browser without the side panel API, gets the same page as a popup instead.

### Dashboard tab

PHAST reads Request, Requested For, Requested By, "Province, City, Barangay" and Hazard Type from the page when it opens and whenever the tab changes. "Rescan Page" reads them again.

From those fields PHAST builds one filename per hazard map (see [Hazards](#hazards) for the codes):

```
{Request}_{code}_{Province}-{City}-Brgy{Barangay}_{Client}-{Requester}_{suffix}
```

The client name is shortened (Corporation to Corp, Department to Dept, and 19 others) and run together in PascalCase. The requester becomes initials plus surname. "Copy All" puts the request ID, hazard types, filenames, client and requester on the clipboard as JSON.

PHAST also looks for request coordinates. It takes the first pair of DMS coordinates it finds in a Remarks cell (the third column of any table on the page); failing that, the first KML or KMZ attachment. Coordinates get "Center Map" and "Copy" buttons, an attachment gets "Import to Map".

### Map Tools tab

These buttons call functions that PHAST injects into the page's own JavaScript context, so they work only on a page with the HAS Admin Leaflet map (`map`, `L` and `drawnItems` globals).

- Overlay Vicinity Map finds image and PDF attachments on the request, prefers ones whose name or row mentions "vicinity", "site map" or "location map", and asks you to pick if there's more than one. Before anything goes on the map, a crop window shows the image: drag a rectangle over the part you want, or choose "Use whole image". The crop is cut from the full-resolution image. For a PDF, only page 1 is used, and the rectangle starts on the map image pasted into the page, so Word's white margins and any caption are already left out; if the page has no such image, it starts inside the white margins instead. The overlay can then be dragged, scaled, rotated, and stretched along either of its own axes with the edge handles. The control panel has an opacity slider, a blink toggle, nudge buttons and Remove Overlay. Running Overlay Vicinity Map again replaces the current overlay.
- Import KML/KMZ fetches every KML and KMZ attached to the request, converts the placemarks to GeoJSON and adds them to the map's drawn layer, so they're also what "Send to EIL-Viz" sends.
- Check Feature in ULAP opens the ULAP portal in a new tab, centred on the coordinates in the first row of the assessment table.
- Copy Coords / KMZ Link centres the map on the first DMS coordinates in a Remarks cell, or if there are none, imports the request's KML/KMZ. Despite the label it doesn't copy anything.

"Send to EIL-Viz" takes the drawn or imported parcel polygon, checks that the EIL server is ready, and opens EIL-Viz in a new tab with the polygon base64-encoded after `#geo=`. Browsers don't send that part of a link to the server, so the parcel stays out of server and proxy logs. It still appears in your browser history. See [EIL server](#eil-server).

### Report tab

"Generate Report" reads the assessment table as it currently is on the page, including any edits you've made, takes the row whose category matches the selected Earthquake or Volcano option (or the first row, if none does), and runs it through the HAR engine. Tick "Vicinity Map Provided" to get the vicinity-map intro sentence; untick it for the coordinates one. With Volcano selected, four more checkboxes appear. "Site is outside the volcano's watershed" applies the distant-site rule regardless of distance, and "Island volcano" switches the distant-site sentence to the island wording. "Nearest active volcano has no hazard map" allows the "delineated 10-kilometer radius" sentence, and "Nearest potentially active volcano has a hazard map" picks the shorter PAV definition. The report also uses the request's "Province, City, Barangay" field to decide whether a Taal fissure section applies.

If a volcano cell can't be read (see [Assessment table columns](#assessment-table-columns)), you get an error instead of a report. When the engine leaves out a status you entered because the rules don't apply that hazard to the nearest volcano, it says so in a box above the report. The box isn't part of the copied text.

The engine copies each hazard status from the table verbatim and adds the matching explanation, recommendation and boilerplate. A status counts as safe only when it contains "safe" and doesn't also say "susceptible" or "prone", so "Partly Safe, Largely Susceptible" is treated as a hazard. The rules it follows are in [docs/LOGIC_GUIDE.md](docs/LOGIC_GUIDE.md), and [Logic engine: doc-to-code mapping](#logic-engine-doc-to-code-mapping) records where the engine does and doesn't implement them.

### Row clicks

On any HAS Admin table with the `items` class, clicking a row toggles that row's checkbox. Clicks on links, buttons and form fields are left alone.

## Installation

### Assessors (no Git needed)

1. Download [phast.zip](https://github.com/alfieprojectsdev/phast/releases/latest/download/phast.zip). The link always points at the latest release.
2. Extract it to a folder you'll keep, such as `Documents\PHAST`. Don't delete or move that folder afterwards: Chrome loads PHAST from it every time it starts.
3. Open `chrome://extensions/` in Chrome.
4. Turn on Developer mode (top right). Chrome only installs extensions from outside the Chrome Web Store this way.
5. Click "Load unpacked" and select the folder that contains `manifest.json`. If extracting created a folder inside your folder, pick the inner one.
6. Optionally, pin PHAST from the puzzle-piece menu next to the address bar so its icon stays visible. Click the icon to open PHAST in the side panel.

To update, download the new `phast.zip`, delete everything inside your PHAST folder, extract the new zip into the same folder, then click the reload arrow on PHAST's card in `chrome://extensions/`. Emptying the folder first stops files from an older release lingering. Your settings carry over.

If you installed PHAST before its first release (from a Git clone or GitHub's Download ZIP), remove that copy in `chrome://extensions/` first, then follow the steps above. Releases have a fixed extension ID, which older copies don't, so the filename suffix and EIL server URL reset once and need setting again.

### Developers

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
| Earthquake-induced landslide | Earthquake | `AF-EIL` | Recommendation only, when the status isn't plain Safe |
| Tsunami | Earthquake | `AF-TSU` | Recommendation only, when the status isn't plain Safe |
| Ground fissure | Earthquake | none | Section whenever the fissure cell has a value |
| Lahar | Volcano | `VOL-LHR` | Section only when not Safe. Pinatubo zones and Mayon categories get their own explanation, and a named Pinatubo zone always renders |
| Pyroclastic flow (PDC) | Volcano | `VOL-PF` | Section only when not Safe |
| Base surge | Volcano | `VOL-BS` | Taal only, when not Safe |
| Lava flow | Volcano | `VOL-LF` | Section only when not Safe; skipped for Pinatubo |
| Ballistic projectiles | Volcano | none | Section only when not Safe; skipped for Pinatubo |
| Volcanic tsunami | Volcano | none | Taal and Iriga only, when not Safe. For other volcanoes the status is left out with a warning; Pinatubo is skipped silently |
| Volcanic fissure | Volcano | none | Sites in the six Taal-area municipalities of Batangas within 50 km, with the Taal reporting note. Elsewhere it's left out with a warning |

Ballistic projectiles and volcanic tsunami are recognised by the table-text search but have no filename code, so they don't produce a file.

## Configuration

Settings open from the Settings button in PHAST's header, or from "Options" when you right-click the toolbar icon. They're stored in `chrome.storage.local`, persist across sessions, and take effect as you type.

- Filename Suffix is appended to every filename. Default `ArP`.
- EIL server URL is blank by default, which means auto-detect. See below.

The manifest asks for `activeTab`, `scripting` (to run the map tools in the page), `sidePanel`, `storage`, `clipboardRead` and `clipboardWrite`. Its host permissions cover HAS Admin, the EIL server candidates, the retired `gps3.local` address (so an older Settings value keeps working) and two local development addresses, which lets PHAST read `/readyz` responses without CORS getting in the way. It also lists `https://*.google.com/*`, though nothing under `src/` currently requests a google.com URL.

## EIL server

EIL analysis runs on a shared server; nothing needs to run on your own machine. The server hosts both EIL-Viz ([eil-viz](https://github.com/alfieprojectsdev/eil-viz)) and the assessment API ([eil-calc](https://github.com/alfieprojectsdev/eil-calc)) behind one origin, so PHAST makes one readiness check against `/readyz`. That endpoint reports whether the server can actually run an assessment (for example, whether the DEM is readable). When it answers 503, PHAST shows the server's own reason.

The address is being migrated, so PHAST probes four candidates at the same time, 1.5 seconds each, and uses the first one in this list that's ready:

1. `http://eil.phivolcs.dost.gov.ph`, the DNS name, once MIS creates the record.
2. `http://gps3:8080`, through Tailscale MagicDNS. Resolves only on a machine that's on the tailnet with MagicDNS on.
3. `http://192.168.48.98:8080`, the LAN address. Needs no tailnet, so it's what an assessor on the PHIVOLCS network falls back to.
4. `http://100.86.209.16:8080`, the Tailscale IP. Works on the tailnet without MagicDNS.

Because the order is fixed, the deployment can move up the list without anyone changing a setting. To point PHAST somewhere else (a test instance, or a server that has moved), fill in EIL server URL in Settings. A value there turns auto-detection off completely, so a typo fails with an error instead of quietly using a different server.

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

Then set EIL server URL in Settings to `http://localhost:5173`.

## Development

There's no build step and no `package.json`. Load the folder unpacked, edit, and reload the extension from `chrome://extensions/`.

| Path | Runs in | Does |
| :--- | :--- | :--- |
| `src/popup/` | Side panel, or popup as a fallback | UI, filename building, EIL probing, report assembly |
| `src/options/` | Settings page | Filename suffix and EIL server URL |
| `src/content/scraper.js` | Page, isolated world | Reads metadata, the assessment table and coordinates; answers the side panel's messages |
| `src/content/row-click.js` | Page, isolated world | Row-click checkbox toggle |
| `src/inject/leaflet-loader.js` | Page, isolated world | Injects `map-handlers.js` into the page's own context |
| `src/inject/map-handlers.js` | Page, main world | `window.PHAST.*`: overlay, KML import, ULAP, coordinates, GeoJSON export |
| `src/lib/filename-generator.js` | Popup | Filename rules |
| `src/lib/eil-handoff.js` | Popup | The link "Send to EIL-Viz" opens |
| `src/lib/panel-tab.js` | Popup | When the side panel clears and rescans after a tab change |
| `src/lib/har-engine/` | Popup | `rules.js` (text and thresholds), `models.js`, `engine.js` (decision logic), `table-row.js` (assessment table row to `Assessment`) |
| `src/background/service-worker.js` | Background | Makes the toolbar icon open the side panel where the browser has one; a `PING` responder |
| `src/vendor/` | Loaded by `map-handlers.js` | Leaflet.DistortableImage, PDF.js, JSZip. See [src/vendor/README.md](src/vendor/README.md) |

### Tests

```
node --test
```

114 tests in `tests/*.test.mjs`: the HAR engine, the table-row mapping in `table-row.js`, the shape of `rules.js`, the EIL-Viz handoff link in `eil-handoff.js`, the side panel's rescan rules in `panel-tab.js`, and the overlay crop helpers in `map-handlers.js` (`window.PHAST.crop`). The crop tests load `map-handlers.js` in a Node vm and read the operator codes from the vendored PDF.js. Nothing tests the side panel page itself, the scraper or the map handlers' DOM and Leaflet code. Tested on Node 24.19.

`tests/mock-page.html` is a stand-in HAS Admin page with a Leaflet map and three attachments, for trying the map tools: a synthetic vicinity map (`tests/fixtures/vicinity-map.png`), the same map pasted into a Word-style A4 page with margins and a caption (`tests/fixtures/vicinity-map-word.pdf`), and a KML. The fixtures are generated, not real places. Fetching attachments doesn't work from `file://`, so serve the repository root over HTTP (for example `python -m http.server 8765`) and open `http://localhost:8765/tests/mock-page.html`. With the extension installed, its content scripts run there only if the address is added to the manifest; without it, the page's "Load map handlers" button loads `src/inject/map-handlers.js` directly. The page loads Leaflet from unpkg, so it needs internet access. Its table doesn't have the column layout the Report tab reads.

### Releasing

`manifest.json` holds the only version number; PHAST's header reads it from there. To publish a release:

1. Bump `version` in `manifest.json` and merge that to main.
2. Tag the merge with the same version and push the tag:
   ```
   git tag v1.1.0
   git push origin v1.1.0
   ```

`.github/workflows/release.yml` then checks that the tag matches the manifest version and that every file the manifest names exists. It zips `manifest.json`, `src/` and `icons/` into `phast.zip` and attaches that to a new GitHub release, which the assessor download link picks up. A tag that doesn't match the manifest fails the workflow without creating a release.

The `key` field in `manifest.json` pins the extension ID to `falagngpanpcbdjfgbjdlihgngnkpdem` wherever the folder is. Don't remove or change it: a different ID is a different extension to Chrome, and assessors would lose their saved settings. The matching private key isn't in the repository. It's only needed to pack a signed `.crx` with this ID, for example for installation through Chrome policy.

### Assessment table columns

The Report tab reads the assessment table (`#assessment-grid table.items`) by column position. The mapping is `COLUMNS` in `src/lib/har-engine/table-row.js`:

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

The two volcano cells must read like `Approximately 12.3 km northeast of Taal Volcano` (`km`, `kilometer` or `kilometers`). The engine takes the distance and name from that pattern. If the nearest active volcano cell doesn't match, or the potentially active volcano cell doesn't match and isn't `--`, Generate Report shows an error naming the cell instead of producing a report.

## Logic engine: doc-to-code mapping

The engine in `src/lib/har-engine/` is meant to track two reference documents in `docs/`. When either changes, review the engine locations below.

Both documents are distilled from PHIVOLCS sources: "HAR Templates (as of June 2024)" (checked on 2026-10-27 against its Word edition), "OHAS Refresher Orientation (2025)", "Finalization VHAR Proposed Template (30 May 2024, edited 11 June 2024)" and "Status of Volcano-related Hazard Information/Maps (15 March 2024)". None of them are in this repository, because their sample reports include personal names; `.gitignore` excludes every PDF in `docs/`, so local copies, including future editions, stay out of commits. Their formatting carries meaning that plain text extraction loses: struck-through text is deleted wording, red italic lines are conditions for when a block applies, not report text, and the numbers in the templates' left column give each statement's position in the issued HAR. Read them as rendered pages, not extracted text. Volcano hazard text follows the "AV only" template; the "with nearest PAV < 50kms" template words lava flow, PDC, ballistic and lahar differently.

Most of `rules.js` is text the engine copies into the report. Some of it is reference data the engine never reads: the `conditions` templates of every hazard except the PDZ, `gep_thresholds`, `gmma_ready_conditions`, `ground_shaking.palawan_sulu`, the `trigger` strings, the earthquake fissure `special_cases` (Muntinlupa), the Taal `fracture_zone_note`, and `ballistic_projectiles.applies_to`. The tables say where that matters.

`applies_to` is checked for base surge and volcanic tsunami. Base surge outside its list is dropped silently. For volcanic tsunami, a status the assessor entered for a volcano not on the list is left out of the report and returned in `HAROutput.warnings`, which PHAST shows above the report. The lists may lag behind the published maps, so a warning means "check", not "wrong". The volcanic fissure section is gated by the site's municipality instead, with `fissure.applies_to` as the fallback when the location can't be read.

### docs/LOGIC_GUIDE.md

| LOGIC_GUIDE.md section | Engine location | What the engine does |
| :--- | :--- | :--- |
| Part 1: Universal boilerplate | `rules.js`: `earthquake_rules.common.intro`, `volcano_rules.common.intro`, `*.common.supersedes` | Uses `with_vicinity_map` when "Vicinity Map Provided" is ticked, otherwise `with_coordinates`. The guide's "No Map Provided" sentence isn't in `rules.js`. `with_both`, `barangay`, `municipal` and the `multiple`/`specific` supersedes variants exist but are never chosen |
| Part 2A: Active fault | `earthquake_rules.active_fault` | Status from the table, plus explanation and recommendation, even when Safe |
| Part 2B: EIL | `earthquake_rules.earthquake_induced_landslide` | Recommendation only, when the status isn't plain safe; the templates have no EIL explanation. `gep_thresholds` isn't read |
| Part 2B: Tsunami | `earthquake_rules.tsunami` | Recommendation only, when the status isn't plain safe; the templates have no tsunami explanation. The `no_data_low_lying_coastal` wording is only there for reference |
| Part 2C: Liquefaction | `earthquake_rules.liquefaction`; `engine.js`: `_isLiqSusceptible()` | No liquefaction section. The status picks the combined ground-shaking-and-liquefaction sentence, or the ground-shaking-only one for a plain "Safe", a blank cell, or "Low Potential" (hardcoded; `gmma_ready_conditions` isn't read). "Largely Safe, Partly Susceptible" and the like get the combined sentence |
| Part 2D: Ground shaking | `earthquake_rules.common.ground_shaking` | Always the `default` sentence. The Palawan/Sulu variant is never chosen |
| Part 3, Step 1: 50 km gatekeeper | `engine.js`: `isDistant` in `processVolcanoAssessment()` | Distant when the nearest active volcano is more than 50 km away or `outside_watershed` is true. A distant report gets the preamble and ashfall statement and no hazard sections. `outside_watershed` comes from the "Site is outside the volcano's watershed" checkbox |
| Part 3, Step 1: Island exception | `volcano_rules.distance_rules.outside_safe_zone_island` | Used when distant and `is_island_volcano` is true. `is_island_volcano` comes from the "Island volcano" checkbox |
| Part 3, Step 1b: AV vs PAV | `engine.js`: PAV block in `processVolcanoAssessment()` | PAV nearer and both under 50 km: PAV statement plus a VOOD note. PAV under 50 km and AV at 50 km or more: PAV statement only, a case the guide doesn't cover. Otherwise no PAV output |
| Part 3, Step 2: PDZ | `volcano_rules.pdz_danger_zone`; `engine.js`: `_processPdz()` | Radius from `special_cases`, matched as a substring of the volcano name; inside when the distance is under the radius. Pinatubo gets danger-zone wording, Taal the island sentence. A volcano with no listed radius gets `no_pdz_within_10km` only when the site is under 10 km and "Nearest active volcano has no hazard map" is ticked |
| Part 3, Step 3: Silent-if-safe hazards | `volcano_rules.lahar`, `pyroclastic_density_current`, `lava_flow`, `ballistic_projectiles`, `volcanic_tsunami` | Section only when the status isn't plain safe. Text follows the 2025 AV-only template. Lava flow, ballistic and volcanic tsunami are skipped for Pinatubo. Lava flow and ballistic are otherwise rendered for any volcano; volcanic tsunami only for volcanoes in its `applies_to`, with a warning for the rest. When the lahar, PDC or lava flow status contains "prone", the PDC recommendation is also added to the common statements |
| Part 3, Step 3: Volcanic tsunami | `volcano_rules.volcanic_tsunami.recommendation` | The template sentence only, ending "...special focus on shoreline communities." |
| Part 3, Step 4: Ashfall | `volcano_rules.common.ashfall` | Always included |
| Part 4, §1: Taal | `pdz_danger_zone.special_cases.taal`, `volcano_rules.base_surge`, `volcano_rules.fissure`; `engine.js`: `_taalFissureGate()` | Island PDZ sentence. Base surge section only for volcanoes named in `base_surge.applies_to` (Taal). Fissure section only for sites in the six Batangas municipalities in `fissure.special_cases.taal`, matched on province and municipality ("City of Tanauan" and "Tanauan City" both match); it carries the reporting note as a `Note:` line. With no readable location it's included when the nearest volcano is Taal, with a warning to check |
| Part 4, §1b: Fissures (Muntinlupa) | `earthquake_rules.fissure`; `engine.js`: `_processEarthquakeFissure()` | Suppressed when the distance to the fissure is over 1000 m (hardcoded). The distance is `fissure_distance_m` when set; otherwise it's read from "Approximately N meters" (or `meter/s`, `m`, `kilometers`, `km`) in the status. A status with no distance, such as "Transected", is rendered. The Muntinlupa reporting note isn't emitted |
| Part 4, §2: Pinatubo | `pdz_danger_zone.conditions.pinatubo_*`, `volcano_rules.lahar.special_cases.pinatubo`; `engine.js`: `isPinatubo`, `_laharSpecialExplanation()` | Danger-zone wording; no lava flow, ballistic or volcanic tsunami sections. A lahar status naming zones ("Zone 1", "Zones 2 and 3") gets the projection sentence plus those zones' definitions instead of the generic explanation |
| Part 4, §3: Mayon | `volcano_rules.lahar.special_cases.mayon`; `engine.js`: `_laharSpecialExplanation()` | A lahar status containing "highly prone", "moderately prone" or "least prone" gets the Mayon projection sentence plus that category's definition |
| Part 4, §4: PAV | `volcano_rules.pav`; `engine.js`: `_getPavStatement()` | The no-map definition ("...therefore, its eruptive and hazard potential is yet to be determined.") unless "Nearest potentially active volcano has a hazard map" is ticked. The alluvial-fan lahar warning isn't emitted |

### docs/VOLCANO_HAZARD_STATUS.md

| VOLCANO_HAZARD_STATUS.md section | Engine location | What the engine does |
| :--- | :--- | :--- |
| Part 1: Standard-format volcanoes | none | Reference for assessors; the engine doesn't check map availability |
| Part 1: Legacy-format volcanoes (PDZ radii) | `pdz_danger_zone.special_cases` | Kanlaon, Bulusan and Hibok-Hibok 4 km, Mayon 6 km, Pinatubo 10 km |
| Part 1: No-map volcanoes | none | Not encoded; Bud Dajo, Makaturing and Musuan are treated like any other volcano |
| Part 2: PAV map status | none | The engine uses whatever status the assessor enters |
| Part 3: Inclusion rules, VTS | `volcanic_tsunami.applies_to` (Taal, Iriga) | Checked, with a warning for other volcanoes. Part 3 also covers volcano islands, which the list doesn't include yet |
| Part 3: Inclusion rules, BP | `ballistic_projectiles.applies_to` (Hibok-Hibok, Taal) | Declared but not checked. The list also contradicts Part 3, which requires BP for all active volcanoes; current behaviour (any volcano except Pinatubo) matches Part 3 |
| Part 3: Inclusion rules, BS | `base_surge.applies_to` (Taal) | Checked |
| Part 3: Inclusion rules, VFI | `volcano_rules.fissure.special_cases.taal` (municipalities), `fissure.applies_to` (fallback) | Gated by the site's municipality, with a warning when left out. Rendered only within 50 km |
| Part 4: PDZ formatting | `pdz_danger_zone.conditions` | Pinatubo, Taal and no-PDZ phrasing as in the LOGIC_GUIDE Step 2 row above |
| Part 5: Pinatubo | `engine.js`: `isPinatubo`, `_laharSpecialExplanation()` | Skips lava flow, ballistic and volcanic tsunami; lahar zones get their template definitions |
| Part 5: Taal | `pdz_danger_zone.special_cases.taal`, `base_surge`, `fissure` | Island PDZ sentence, base surge section, and the fissure section with its reporting note for the Taal-area municipalities |

### Model fields the table doesn't carry

These fields drive documented rules but have no column in the assessment table.

| Field | Model | Rule it gates | Where PHAST gets it |
| :--- | :--- | :--- | :--- |
| `fissure_distance_m` | `EarthquakeAssessment` | 1 km fissure trigger (Taal, Muntinlupa) | Not set; the engine reads the distance from the fissure status text |
| `outside_watershed` | `VolcanoAssessment` | Distant gatekeeper regardless of distance | "Site is outside the volcano's watershed" checkbox |
| `is_island_volcano` | `VolcanoAssessment` | Shorter island text for distant sites | "Island volcano" checkbox |
| `av_has_hazard_map` | `VolcanoAssessment` | "Delineated 10-kilometer radius" sentence (only when false) | "Nearest active volcano has no hazard map" checkbox; default true |
| `pav_has_hazard_map` | `VolcanoAssessment` | Which PAV definition is used | "Nearest potentially active volcano has a hazard map" checkbox; default false |
| `site_location` | `Assessment` | Taal fissure gate | The request's "Province, City, Barangay" field, read as barangay, municipality, province |

---

Internal tool for PHIVOLCS HAS Admin use.
