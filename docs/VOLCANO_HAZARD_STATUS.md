# Volcano Hazard Map Status Reference

*Distilled from: DOST-PHIVOLCS Status of Volcano-related Hazard Information/Maps, 15 March 2024.*
*Use this alongside [LOGIC_GUIDE.md](LOGIC_GUIDE.md) when generating volcano HAR reports.*

---

## Hazard Map Type Codes

| Code | Hazard |
| :--- | :--- |
| **PDC** | Pyroclastic Density Current (includes flows, surges) |
| **BS** | Base Surge (PDC subtype; Taal-specific) |
| **LHR** | Lahar |
| **LV** | Lava Flow |
| **BP** | Ballistic Projectiles |
| **VTS** | Volcanic Tsunami |
| **TEP** | Tephra / Ashfall |
| **PDZ** | Permanent Danger Zone |
| **VFI** | Volcanic Fissure |

---

## Part 1: Active Volcanoes (24 total)

### Map Format Legend

| Symbol | Meaning |
| :--- | :--- |
| ✅ Standard | New standardized format (post-2020 NVTA revision) |
| 🔵 Legacy | Existing maps; not yet in standard format |
| ❌ No Maps | Ongoing Eruptive/Technical Review (ETR) as of 2024 — assessment deferred |

---

### Standard-Format Volcanoes

The following 12 AVs have published hazard maps in the current NVTA standard format. Unless noted otherwise, applicable maps follow the standard set (PDC, LHR, LV, BP; VTS where applicable).

| Volcano | Status | Notes |
| :--- | :--- | :--- |
| Babuyan Claro | ✅ Standard | — |
| Biliran | ✅ Standard | — |
| Camiguin de Babuyanes | ✅ Standard | — |
| Cagua | ✅ Standard | — |
| Didicas | ✅ Standard | — |
| Iraya | ✅ Standard | — |
| Isarog | ✅ Standard | — |
| Leonard Kniaseff | ✅ Standard | — |
| Matutum | ✅ Standard | — |
| Parker | ✅ Standard | — |
| Ragang | ✅ Standard | — |
| Smith | ✅ Standard | — |

---

### Legacy-Format Volcanoes

These 9 AVs have hazard maps, but not yet in the NVTA standard format. Map years and available types are noted where confirmed.

| Volcano | Available Maps (Year) | Engine Notes |
| :--- | :--- | :--- |
| **Banahaw** | Legacy format | Refer to source maps; standard set pending |
| **Bulusan** | PDC (2016), LHR (2016), LV (2016), TEP (2010); PDZ = 4 km | 4 km PDZ radius |
| **Cabalian** | Legacy format | Refer to source maps |
| **Hibok-Hibok** | PDC (1988), LHR (1988), LV (1988), BP (2023) | 4 km PDZ radius; BP map updated 2023 |
| **Iriga** | PDC (2023), LHR (1999), VTS (2023) | VTS applicable; no LV or BP maps on record |
| **Kanlaon** | Legacy format | 4 km PDZ radius |
| **Mayon** | Legacy format | 6 km PDZ radius; lahar uses Highly/Moderately/Least Prone categories |
| **Pinatubo** | LHR (2022), Radial Distance (2021) | See **Pinatubo Special Rules** below |
| **Taal** | PDC/BS (2020), BP (2020), VTS (2020), VFI (2023) | See **Taal Special Rules** below |

---

### No-Map Volcanoes (Ongoing ETR as of 2024)

Hazard assessment for these volcanoes is deferred pending completion of Eruptive and Technical Review.

| Volcano | Status |
| :--- | :--- |
| Bud Dajo | Ongoing ETR 2024 |
| Makaturing | Ongoing ETR 2024 |
| Musuan | Ongoing ETR 2024 |

> **HAR Action:** If a site is near one of these volcanoes, coordinate with the Institute before issuing a hazard assessment.

---

## Part 2: Potentially Active Volcanoes (PAV) — 27 total

PAVs are morphologically young-looking volcanoes with **no historical or documented record of eruption**. Most have no published hazard maps.

| Category | Volcanoes |
| :--- | :--- |
| **Has hazard maps** | **Mahagnao** — PDC, LHR (2022) |
| **Ongoing qualitative assessment** | **Apo**, **Natib** |
| **No maps** | All other 24 PAVs |

> **HAR Text for PAVs (no maps):**
> *"[Name] Volcano is currently classified by DOST-PHIVOLCS as a potentially active volcano... morphologically young-looking but with no historical or analytical records of eruption."*
>
> If site is on an alluvial fan near the volcano, also add the lahar warning per LOGIC_GUIDE.md Part 4.

---

## Part 3: NVTA Standard Inclusion Rules

Per the NVTA framework (slide 20 of the source presentation), the following governs which hazard maps should be produced and assessed for each volcano type:

### For Active Volcanoes

| Hazard | Inclusion Rule |
| :--- | :--- |
| **LV, LHR, PDC, BP** | Required for **all 24 AVs** (standard set) |
| **VTS** | Only for volcanoes with: (a) documented Holocene tsunamis, or (b) a volcano island |
| **TEP** | Assessed universally via ashfall statement (all reports, all distances) |
| **PDZ** | Required for all AVs |
| **BS, VFI** | Taal-specific |

### For Potentially Active Volcanoes

| Hazard | Inclusion Rule |
| :--- | :--- |
| **LV, LHR, PDC** | Only if geological evidence exists |
| **BP** | If PDC capability is established |
| **VTS** | If documented Holocene tsunamis or volcano island present |

---

## Part 4: Per-Volcano Special Rules

These expand on LOGIC_GUIDE.md Part 4 ("Red Flags").

### Pinatubo

**Status:** Legacy — lahar is the only confirmed finalized map.

| Hazard | Status | HAR Action |
| :--- | :--- | :--- |
| **LHR** | ✅ Published (2022) | Use Pinatubo Lahar Zone system (Zones 1–5) — NOT Prone/Safe |
| **PDC (PF)** | Ongoing qualitative | Assess if data is present; otherwise defer |
| **LV** | To verify | **Skip** — no finalized map |
| **BP** | To verify | **Skip** — no finalized map |
| **VTS** | Not applicable | **Skip** — always |
| **PDZ** | "10-kilometer danger zone" | Use this exact phrase, not "PDZ" |

**Pinatubo Lahar Zones:**
* *Zone 1:* High susceptibility to large-magnitude lahars.
* *Zone 2:* Moderate susceptibility; affected by moderate to large lahars.
* *Zone 3:* Low susceptibility; affected by large lahars only.
* *Zone 4:* Safe from lahars but susceptible to sediment-laden stream flows.
* *Zone 5:* Safe from lahars but susceptible to flooding/backflooding.

---

### Taal

**Status:** Legacy — all primary maps from 2020; VFI from 2023.

| Hazard | Status | HAR Action |
| :--- | :--- | :--- |
| **PDC / BS** | ✅ Published (2020) | Use "Base Surge" language for Taal; assess both PDC and BS if applicable |
| **BP** | ✅ Published (2020) | Assess if applicable |
| **VTS** | ✅ Published (2020) | Assess if applicable |
| **VFI** | ✅ Published (2023) | Standard-format fissure map; include fissure section |
| **PDZ** | Taal Volcano Island | Do **not** use a radius; use: *"Taal Volcano Island is designated as the Permanent Danger Zone of the volcano."* |

> **Fissure note for Taal:** If safe from fissure, still add: *"Stakeholders are advised to report to the Institute fissures that may be observed in the area."*

---

### Hibok-Hibok

**Status:** Legacy — primary maps from 1988; BP updated 2023.

| Hazard | Status | HAR Action |
| :--- | :--- | :--- |
| **PDC** | 1988 | Assess if applicable |
| **LHR** | 1988 | Assess if applicable |
| **LV** | 1988 | Assess if applicable |
| **BP** | ✅ Updated (2023) | Assess if applicable |
| **PDZ** | 4 km radius | Standard language applies |

---

### Iriga

**Status:** Legacy — mixed map years.

| Hazard | Status | HAR Action |
| :--- | :--- | :--- |
| **PDC** | ✅ 2023 | Assess if applicable |
| **LHR** | 1999 | Assess if applicable |
| **VTS** | ✅ 2023 | Assess if applicable |
| **LV, BP** | No map on record | Skip unless new maps published |

---

### Mayon

**Status:** Legacy. **PDZ = 6 km radius.**

Lahar assessment uses specific categories:
* **Highly Prone:** Adjacent to active river channels draining the volcano.
* **Moderately Prone:** Medial to distal portions of lahar fans.
* **Least Prone:** Distal portions or areas between river channels.

---

### Bulusan

**Status:** Legacy. **PDZ = 4 km radius.**

| Hazard | Status |
| :--- | :--- |
| PDC | 2016 |
| LHR | 2016 |
| LV | 2016 |
| TEP | 2010 |

---

*Source: DOST-PHIVOLCS, "Status of Volcano-related Hazard Information/Maps," 15 March 2024.*
*For the most current map availability, consult the Volcano Monitoring and Eruption Prediction Division.*
