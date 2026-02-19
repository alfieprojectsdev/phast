# PHAT: PHIVOLCS Hazard Assessment Tool

A Chrome Extension that consolidates geohazard assessment tools into a single interface for use with the HAS Admin platform.

## What It Does

PHAT replaces 7 separate browser tools (3 extensions + 4 bookmarklets) with one unified extension. It provides:

- **Automatic metadata scraping** from HAS Admin request pages (Request ID, Client, Location)
- **Standardized filename generation** for Hazard Assessment Maps based on detected hazard types
- **Map tools** for vicinity map overlay, KML/KMZ import, and ULAP feature checking
- **HAR report generation** from the assessment table with earthquake and volcano category support

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `phat/` folder (the one containing `manifest.json`)
5. The PHAT icon will appear in your extensions toolbar

Pin the extension for quick access: click the puzzle piece icon in Chrome's toolbar, then click the pin next to PHAT.

## Usage

Navigate to a request page on HAS Admin, then click the PHAT icon. The extension has four tabs:

### Dashboard

Automatically displays the current request's metadata:
- **Request ID**, **Location**, and **Client** are scraped from the page on load
- **Generated Filenames** are produced based on detected hazard types
- **Copy All** copies the full metadata + filenames as JSON to your clipboard

Click **Rescan Page** if the data doesn't load or if you've navigated to a different request.

### Map Tools

Three tools that inject directly into the active map on the page:

- **Overlay Vicinity Map** — Loads the request's attached vicinity map as a draggable, scalable overlay on top of the Leaflet map. Includes opacity slider, blink tool, and nudge controls for precise alignment.
- **Import KML/KMZ** — Opens a file picker to load KML or KMZ files onto the map as GeoJSON layers.
- **Check Feature in ULAP** — Verifies whether drawn features intersect with the ULAP boundary.

These require the map page to be fully loaded. If you see "Map handlers not loaded yet", wait a moment and try again.

### Report

Generates a Hazard Assessment Report (HAR) from the assessment table on the current page:

1. Select the **Category** (Earthquake or Volcano)
2. Check or uncheck **Vicinity Map Provided** as appropriate
3. Click **Generate Report**
4. Review the output in the text area
5. Click **Copy to Clipboard** to copy

**Important**: The report reads the *current state* of the assessment table. If you've manually edited cells to remove false positives or refine data, those edits will be reflected in the generated report. Always generate the report *after* you've finalized your edits.

### Settings

- **Filename Suffix** — Sets the suffix appended to generated filenames (default: `ArP`). This persists across sessions.

## Workflow

The intended workflow follows a human-in-the-loop process:

1. **Open a request page** on HAS Admin. PHAT automatically scrapes metadata and generates filenames (Dashboard tab).
2. **Review and edit** the assessment table on the page as needed — remove false positives, correct values.
3. **Use Map Tools** as needed — overlay the vicinity map for reference, import KML boundaries, check ULAP.
4. **Generate the report** (Report tab) only after you've finalized your table edits. The report engine reads the live table state.

## Supported Hazard Types

The extension detects and processes the following hazard types:

**Earthquake**: Active Fault, Liquefaction, Landslide (Earthquake-Induced), Tsunami, Ground Fissure

**Volcano**: Lahar, Pyroclastic Flow, Base Surge, Lava Flow, Ballistic Projectiles, Volcanic Tsunami

## Permissions

PHAT requires the following Chrome permissions:
- **Active Tab / Scripting** — To read page data and inject map tools
- **Storage** — To save settings and cache scraped metadata
- **Clipboard** — To copy filenames and reports

The extension only activates on `hasadmin.phivolcs.dost.gov.ph` pages.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Dashboard shows "Scanning..." | Click Rescan Page. If the page hasn't fully loaded, wait and try again. |
| "Error connecting..." | The content script may not have loaded. Refresh the HAS Admin page and reopen PHAT. |
| Map tools say "not loaded yet" | The map page needs to finish loading. Wait a few seconds and retry. |
| Report shows "No assessment table data" | Make sure you're on a request page that has an assessment table (`#assessment-grid`). |
| Filenames look wrong | Check that the Filename Suffix in Settings matches your team's convention. |
