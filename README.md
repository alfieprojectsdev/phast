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
* **Vicinity Overlays:** Drag, scale, and align vicinity maps with precision opacity and nudge controls.
* **KML/KMZ Import:** Load boundary files directly onto the assessment map.
* **ULAP Validation:** Instant boundary checks against ULAP features.
* **Coordinate Navigation:** Parse DMS coordinates from request remarks and center the map instantly.

### 3. The Logic Engine (HAR Generator)
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
* **Permissions:** Requires `Active Tab` (for injection), `Storage` (for settings), and `Clipboard`.

---

*Internal Tool — For PHIVOLCS HAS Admin Use Only.*
