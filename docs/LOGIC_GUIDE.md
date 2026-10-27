# HAR Manual Logic Guide

*A distilled logic reference for the PHIVOLCS Hazard Assessment Report (HAR) Engine.*

*Which of these rules the PHAST engine actually implements is recorded in the doc-to-code mapping in [README.md](../README.md#logic-engine-doc-to-code-mapping).*

*Checked on 2026-10-27 against "HAR Templates (as of June 2024)" (Word edition) and "OHAS Refresher Orientation (2025)". Where those two disagree with older wording, the AV-only template in the Word edition wins.*

---

## Part 1: The universal boilerplate
*Mandatory statements for **every** report, regardless of hazard status.*

### 1. Introduction (Choose Source)

| If your source is... | **Copy This:** |
| :--- | :--- |
| **Vicinity Map** | All hazard assessments are based on the latest available hazard maps and on the location indicated in the vicinity map provided. |
| **Coordinates (GPS)** | All hazard assessments are based on the latest available hazard maps and on the location indicated by the coordinates provided. |
| **No Map Provided** | All hazard assessments are based on the latest available hazard maps. In the absence of vicinity maps, the location of the property used were those indicated in Google Earth, Google Maps, or Wikimapia. |

### 2. The "Supersedes" Clause (End of Report)
> "This hazard assessment supersedes any previous assessment made by this office regarding the site."

---

## Part 2: Earthquake hazards logic
*Flow: Check Map → Select Status → Copy Explanation.*

### A. Active Fault (Ground Rupture)
*Rule: **ALWAYS** explain, even if Safe.*

| Map Status | **Assessment Text** | **Required Explanation / Recommendation** |
| :--- | :--- | :--- |
| **SAFE** (> 5m away) | *Safe; Approximately [X] km [Direction] of the [Fault Name]* | **Explanation:** Ground rupture hazard assessment is the distance to the nearest known active fault.<br><br>**Rec:** The recommended buffer zone, or Zone of Avoidance, against ground rupture hazard is at least 5 meters on both sides of the active fault or from its zone of deformation. |
| **PRONE** (Buffer) | *Prone; Within the buffer zone* | *Same as above.* |
| **PRONE** (Transected) | *Prone; Transected by the [Fault Name]* | *Same as above.* |

### B. The "Silent if Safe" Hazards
*Rule: If the map says **SAFE**, you write "Safe" and **add nothing**. Only add the recommendation if **PRONE** or susceptible.*

| Hazard | If Map says **PRONE**, add this text: |
| :--- | :--- |
| **EIL** (Landslide) | **Rec:** Avoidance is recommended for sites with earthquake-induced landslide hazard unless appropriate engineering interventions are in place. |
| **Tsunami** | **Rec:** Tsunami threat to people's lives can be addressed by community preparedness and tsunami evacuation plan... *(standard Tsunami evacuation text)* |

The templates have no explanation sentence for EIL or tsunami, only the recommendation (HAR Templates p11; OHAS 2025 slide 61).

> **Partly/largely statuses count as susceptible.** For EIL and liquefaction the templates use "Largely Safe, Partly Susceptible", "Partly Safe, Largely Susceptible" and "Partly Safe, Partly Susceptible" (and Least/Moderately/Highly variants) when only part of the site is covered. "Largely" means over 70% coverage, anything less is "Partly" (OHAS 2025 slides 52-53). Any of these takes the recommendation; only a plain "Safe" doesn't.

> **EIL — Standard Parameters (for General Elevation Profile / no regional data):**
> * **Slope Threshold:** ≤ 15° (≤ 25%) → **Safe**. > 15° (> 25%) → **Susceptible**.
> * **Depositional Zone:** Safe if horizontal distance H > 3 × ΔE, where ΔE = Elev_Max − Elev_Min. If H ≤ 3 × ΔE, assess as: *"Prone; Within the depositional zone."*

> **Tsunami — No Map Data (Low-Lying Coastal Area):**
> If the site is in a low-lying coastal area and no specific tsunami hazard map is available, use:
> *"Low-lying coastal area is prone to local tsunami due to offshore fault or submarine landslide."*

### C. Liquefaction (The Exception)
*Rule: Unlike EIL/Tsunami, Liquefaction has a mandatory recommendation even if Safe.*

* **Assessment:** Safe / Susceptible / Highly Susceptible
* **Mandatory Recommendation:** "Ground shaking and liquefaction hazards can be mitigated by following the provisions of the National Building Code and the Structural Code of the Philippines."

> **GMMA-READY Maps — Special Formatting Rule:**
> For GMMA-READY liquefaction maps, the output must be exactly **"Low Potential"**, **"Moderate Potential"**, or **"High Potential"**.
> **Never** use the modifiers *"partly"* or *"largely"* for GMMA-READY maps, regardless of how much of the site falls within a given zone.

### D. Ground Shaking (Universal)
* **Standard:** "All sites may be affected by strong ground shaking."
* **Palawan/Sulu Only:** Remove the word "strong".

---

## Part 3: Volcano hazards logic
*Follow this flowchart to avoid errors.*

### Step 1: The "50km Gatekeeper"
Measure distance to the nearest active volcano.

* **IF > 50 KM — or — outside the volcano watershed:**
    1.  Write: *"Considering the distance of the site from the volcano, the site is safe from volcanic hazards such as pyroclastic density currents, lava flows, and ballistic projectiles that may originate from the volcano."*
    2.  Add **Ashfall Statement** (See Step 4).
    3.  **STOP.** You are done. Do not assess Lahar/PDC/Lava.

    > **Island Volcano Exception:** For sites outside a volcano island (e.g., Biliran, Hibok-Hibok), use instead: *"Considering the distance of the site from the volcano, the site is safe from erupted products of a hazardous volcanic eruption."*

* **IF < 50 KM — and — inside the volcano watershed:**
    * Proceed to **Step 1b**, then **Step 2**.

### Step 1b: AV vs. PAV Distance Conflict
*Only applies when both an Active Volcano (AV) and a Potentially Active Volcano (PAV) are within 50 km.*

| Scenario | Action |
| :--- | :--- |
| AV is nearer than PAV (both < 50 km) | Assess the **AV only**. |
| PAV is nearer than AV (both < 50 km) | Assess **both** the AV and PAV. Consult the Volcano Officer of the Day (VOOD). |
| Both AV and PAV are > 50 km away | Assess the **AV only**. |

### Step 2: The PDZ Check (Permanent Danger Zone)
*Does the site fall inside the circle?*

| Status | **Assessment Text** | **Required Explanation** |
| :--- | :--- | :--- |
| **INSIDE PDZ** | *The site is **inside** the [X]-kilometer Permanent Danger Zone...* | The Permanent Danger Zone (PDZ) is a zone that can always be affected by small-scale eruptions of [Volcano Name] Volcano. Human settlement is not recommended within the PDZ. |
| **OUTSIDE PDZ** | *The site is **outside** the [X]-kilometer Permanent Danger Zone...* | *Same as above.* |

> **CRITICAL EXCEPTIONS:**
> * **Taal:** PDZ is **"Taal Volcano Island"** (Not a radius).
> * **Pinatubo:** Uses **"10-kilometer danger zone"** (Not "PDZ").
> * **Kanlaon/Bulusan/Hibok-Hibok:** 4km radius.
> * **Mayon:** 6km radius.
> * **AV with no hazard map and no PDZ, site within ~10 km:** *"The site is within the delineated 10-kilometer radius of the volcano and is considered as highly prone to eruptive processes and products in the event of an eruption."* A volcano with no PDZ that **has** hazard maps gets no PDZ sentence at all.

### Step 3: The "Silent if Safe" Volcano Hazards
*Rule: Like Earthquake, generally only explain if **PRONE**.*

| Hazard | If Map says **PRONE**, add this text: |
| :--- | :--- |
| **Lahar** | **Expl:** Lahars are rapidly flowing mixtures of volcanic sediment and water in rivers that drain down volcanoes, typically produced by prolonged and intense rainfall. Lahars can cause extensive burial or washout of communities that can lead to physical injuries and loss of life, damage to built environment, agriculture, livestock, infrastructure, properties, as well as long-term flooding and siltation in river systems.<br>**Rec:** Lahar threat to people's lives can be addressed by 1) observing or implementing legal easement... and 2) community preparedness... *(Pinatubo and Mayon use their own explanation; see Part 4.)* |
| **PDC** | **Expl:** Pyroclastic Density Currents (PDCs), such as flows, surges and base surges are turbulent, fast-moving hot mixtures of volcanic fragments and gas that sweep down/away from an erupting volcano. PDCs can cause loss of life due to burning, impact force, abrasion, asphyxiation, and extreme physical injuries, burial, and damage to agriculture, livestock, and properties.<br>**Rec (add if prone to PDCs and/or lava flows):** Avoidance is recommended for site/sites that may potentially be affected by pyroclastic density currents (PDCs) and lava flows. |
| **Lava Flow** | **Expl:** Lava flows are rivers of hot molten rock that can burn and bury land and make these lands unusable for a long period of time.<br>**Rec:** *Use PDC recommendation above.* |
| **Ballistic** | **Expl:** Ballistic projectiles are fragments thrown at a close distance from the vent/crater of an erupting volcano. Ballistic projectiles can cause loss of life, physical injuries, and damage to properties due to forceful impact when hitting ground. |
| **Volcanic Tsunami** | **Expl:** Volcanic tsunami can be generated by the sudden displacement of sea/lake water by the entry of large masses of volcanic material, underwater explosion, and/or rapid ground deformation during volcanic activity. Volcanic tsunamis can cause inundation and washout of communities, drowning, physical injuries, and damage to infrastructure and properties.<br>**Rec (add if prone):** Tsunami threat related to the volcanic unrests can be addressed by community preparedness and tsunami evacuation plan, with special focus on shoreline communities. |

These are the AV-only template's wording. The template for hazards assessed from a nearby PAV (HAR Templates p17) words lava flow, PDC, ballistic and lahar differently.

### Step 4: Ashfall (Universal)
*Rule: **ALWAYS** include this for Volcano reports, regardless of distance.*

> "In case of future eruptions of [Volcano Name] Volcano and other nearby volcanoes, the site/s may be affected by tephra fall/ ashfall depending on the height of the eruption plume and prevailing wind direction at the time of eruption. Generally, tephra fall/ ashfall is thicker near the eruption center and thins away from the volcano. Ash can cause widespread infrastructural, agricultural, and property damages, and negative health impacts."

---

## Part 4: The "red flags" (special exceptions)
*Check this list before finalizing any report.*

### 1. TAAL VOLCANO
* **PDZ:** Do not use kilometers. Use: *"Taal Volcano Island is designated as the Permanent Danger Zone of the volcano."*
* **Base Surge:** If prone, explain: *"Prone; Within the base surge buffer zone."*
* **Fissures:** only for sites in **Agoncillo, Lemery, Taal, Talisay, Tanauan or San Nicolas (Batangas)** with a fissure assessment (HAR Templates p12).
    * **If Safe:** *"Safe; Approx [X] meters from mapped fissure."*
    * **Explanation:** *"Volcanic fissures identified are based on results from detailed field investigations. Hazard assessment may change as DOST-PHIVOLCS scientists gather more information on fissure occurrences."*
    * **Recommendation:** *"Fissures may develop further if the condition that generated them persists, as a response to geological processes. For land-use planning and disaster risk reduction purposes, at least 5 meters on both sides of the fissure or at the edge of the deformation zone may be considered as a Zone of Avoidance."*
    * **Mandatory Note:** *"Stakeholders are advised to report to the Institute fissures that may be observed at Taal Volcano and vicinity that need to be reflected in the fissure map."*

### 1b. FISSURES — MUNTINLUPA
* Fissure assessment is **required** for Muntinlupa sites that are **less than 1 kilometer** from the nearest mapped fissure.
* Use the same Safe/Prone language and mandatory note as Taal fissures above.

### 2. PINATUBO (lahar hazard only)
* **Lahar Zones:** Do not use Prone/Safe. Use **Zones (1-5)**.
* **Explanation:** instead of the generic lahar explanation, write *"The lahar hazards assessment for Pinatubo Volcano is a long-term lahar hazard projection based on the volcano's morphology, eruption history, as well as its tendency for rapid morphologic changes during periods of intense and/or prolonged rainfall, or after a major lahar event."*, then the definition of each zone the site is in:
    * *Zone 1* includes areas at high susceptibility to large-magnitude lahars (more than 10 million cubic meters per event) and sediment-laden (muddy) stream flows and flashfloods.
    * *Zone 2* includes areas at low susceptibility to large-magnitude lahars, moderate to high susceptibility to small-magnitude lahars, and high susceptibility to sediment-laden (muddy) stream flows and/or flashfloods.
    * *Zone 3* includes areas at low susceptibility to small-magnitude lahars and high susceptibility to sediment-laden (muddy) stream flows.
    * *Zone 4* are areas safe from lahars but susceptible to sediment-laden (muddy) stream flows or siltation.
    * *Zone 5* are areas safe from lahars but susceptible to persistent (more than one week) or recurrent flooding and/or backflooding due to drainage blockage.
* **Recommendation:** the standard lahar recommendation.

### 3. MAYON (if with lahar hazard)
* **Explanation:** the same projection sentence with "Mayon Volcano", then the definition of the category:
    * *Highly prone:* Areas highly prone to lahars are located adjacent to an active river channel that may be a potential lahar avenue in the event of an explosive eruption and additional lahar source materials become available.
    * *Moderately prone:* Areas moderately prone to lahars are located in medial or distal portions of lahar fans, with a moderate probability of being affected by lahars and a high probability of being affected by sediment-laden streamflows.
    * *Least prone:* Areas least prone to lahars are zones located in distal portions of lahar fans, or between river channels, with a low probability of being affected by lahars and by sediment-laden stream flows.
* **Recommendation:** the standard lahar recommendation.

### 4. Potentially Active Volcanoes (PAV)
*If the nearest volcano is a PAV (e.g., Mt. Arayat, Mt. Isarog).*
* **Definition, PAV with a hazard map:** *"[Name] Volcano is currently classified by DOST-PHIVOLCS as a potentially active volcano, which is morphologically young-looking but with no historical or analytical records of eruption."*
* **Definition, PAV with no hazard map:** *"[Name] Volcano is currently classified by DOST-PHIVOLCS as a potentially active volcano, which is morphologically young-looking but with no historical or analytical records of eruption, therefore, its eruptive and hazard potential is yet to be determined."* (HAR Templates p17)
* **Lahar Warning:** *"The site is located on the alluvial fan near [Name] and may be potentially affected by lahars in the event of severe/prolonged precipitation..."*
