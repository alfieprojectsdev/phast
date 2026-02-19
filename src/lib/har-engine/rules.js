// src/lib/har-engine/rules.js
// Exporting the schema directly

export const HAZARD_RULES_SCHEMA = {
    "metadata": {
        "version": "2.1",
        "source": "PHIVOLCS HAR Templates (June 2024)",
        "description": "Rule-based lookup for generating earthquake and volcano hazard explanations",
        "last_updated": "2025-12-12"
    },
    "earthquake_rules": {
        "common": {
            "intro": {
                "with_vicinity_map": "All hazard assessments are based on the latest available hazard maps and on the location indicated in the vicinity map provided.",
                "with_coordinates": "All hazard assessments are based on the latest available hazard maps and on the location indicated by the coordinates provided.",
                "with_both": "All hazard assessments are based on the latest available hazard maps and on the location indicated in the vicinity map and by the coordinates provided.",
                "barangay": "Barangay hazard assessment is made when an appropriate vicinity map is not provided. Please note that barangays are located using the PSA (2016/2020). All hazard assessments are based on the latest available hazard maps.",
                "municipal": "Municipal hazard assessment is made when an appropriate vicinity map is not provided. Please note that municipalities are located using the PSA (2016/2020). All hazard assessments are based on the latest available hazard maps."
            },
            "ground_shaking": {
                "default": "All sites may be affected by strong ground shaking.",
                "palawan_sulu": "All sites may be affected by ground shaking."
            },
            "supersedes": {
                "single": "This hazard assessment supersedes any previous assessment made by this office regarding the site.",
                "multiple": "This hazard assessment supersedes any previous assessment made by this office regarding the sites.",
                "specific": "This hazard assessment supersedes previous assessment, HAS-MM-YY-xxx dated DAY-MM-YY, made by this office regarding the site."
            },
            "ground_shaking_liquefaction_combined": {
                "text": "Ground shaking and liquefaction hazards can be mitigated by following the provisions of the National Building Code and the Structural Code of the Philippines."
            },
            "ground_shaking_mitigation_only": {
                "text": "Ground shaking hazard can be mitigated by following the provisions of the National Building Code and the Structural Code of the Philippines."
            }
        },
        "active_fault": {
            "name": "Active Fault / Ground Rupture",
            "explanation": "Ground rupture hazard assessment is the distance to the nearest known active fault.",
            "recommendation": "The recommended buffer zone, or Zone of Avoidance, against ground rupture hazard is at least 5 meters on both sides of the active fault or from its zone of deformation.",
            "policy": { "show_explanation_if_safe": true },
            "conditions": {
                "safe": {
                    "threshold_km": 0.005,
                    "template": "Safe; Approximately {distance} kilometers {direction} of the {fault_name}",
                    "notes": "Write Fault Name as: Fault Name: Segment Name or Fault Name"
                },
                "buffer_zone": {
                    "threshold_m": 5,
                    "template": "Prone; Within the buffer zone; Approximately {distance} meter/s (or less) {direction} of the {fault_name}"
                },
                "transected": {
                    "template": "Prone; Transected by the {fault_name}",
                    "with_portion": "Prone; Transected by the {fault_name} at the {portion} portion of the property"
                },
                "unnamed_fault": {
                    "safe": "Safe; Approximately {distance} kilometers {direction} of an unnamed fault traversing {location}",
                    "transected": "Prone; Transected by an unnamed fault traversing {location} at the {portion} of the property"
                },
                "offshore": {
                    "template": "Safe; Approximately {distance} kilometers {direction} of nearest offshore fault and approximately {distance2} kilometers {direction2} of {onland_fault}"
                }
            }
        },
        "fissure": {
            "name": "Fissure (Earthquake-Related)",
            "explanation": "Fissure, with its related ground subsidence, may not be a potential source of earthquakes. However, fissures and ground subsidence may develop further if the condition that generated them continues to persist, or as a response to strong ground shaking.",
            "recommendation": "The recommended buffer zone, or Zone of Avoidance, against fissuring is at least 5 meters on both sides of the fissure.",
            "conditions": {
                "safe": {
                    "template": "Safe; Approximately {distance} meters {direction} of a mapped fissure"
                },
                "within_buffer": {
                    "threshold_m": 5,
                    "template": "Prone; Within the buffer zone; Approximately {distance} meter/s (or less) {direction} of a mapped fissure"
                },
                "transected": {
                    "template": "Prone; Transected by a mapped fissure at the {portion} portion of the property"
                }
            },
            "trigger": "only_if_within_1km_of_mapped_fissure"
        },
        "liquefaction": {
            "name": "Liquefaction",
            "recommendation": "Ground shaking and liquefaction hazards can be mitigated by following the provisions of the National Building Code and the Structural Code of the Philippines.",
            "policy": { "show_explanation_if_safe": true },
            "conditions": {
                "safe": { "template": "Safe" },
                "susceptible": { "template": "Susceptible" },
                "least_susceptible": { "template": "Least Susceptible" },
                "moderately_susceptible": { "template": "Moderately Susceptible" },
                "highly_susceptible": { "template": "Highly Susceptible" }
            }
        },
        "earthquake_induced_landslide": {
            "name": "Earthquake-Induced Landslide",
            "explanation": "Earthquake-induced landslides are the downward slope movement of rocks, soil and other debris triggered by strong ground shaking.",
            "recommendation": "Avoidance is recommended for sites with earthquake-induced landslide hazard unless appropriate engineering interventions are in place.",
            "policy": { "show_explanation_if_safe": false },
            "conditions": {
                "safe": { "template": "Safe" },
                "susceptible": { "template": "Susceptible" },
                "least_susceptible": { "template": "Least Susceptible" },
                "moderately_susceptible": { "template": "Moderately Susceptible" },
                "highly_susceptible": { "template": "Highly Susceptible" },
                "depositional_zone": { "template": "Prone; Within the depositional zone" }
            }
        },
        "tsunami": {
            "name": "Tsunami (Earthquake-Induced)",
            "explanation": "A tsunami is a series of sea waves commonly generated by under-the-sea earthquakes and whose heights could be greater than 5 meters.",
            "recommendation": "Tsunami threat to people's lives can be addressed by community preparedness and tsunami evacuation plan. Advice for tsunami evacuation comes from public agencies and local governments. But more importantly, coastal communities must learn to evacuate themselves when they recognize the three natural signs of tsunami, namely 1) strong ground shaking, 2) unusual rise or fall of sea level, and 3) strong or unusual sound coming from the sea.",
            "policy": { "show_explanation_if_safe": false },
            "conditions": {
                "safe": { "template": "Safe" },
                "prone": { "template": "Prone; Within the tsunami inundation zone" },
                "low_lying_coastal_ew": { "template": "Low-lying coastal area is within the tsunami inundation zone" }
            }
        }
    },
    "volcano_rules": {
        "common": {
            "intro": {
                "with_vicinity_map": "All hazard assessments are based on the latest available hazard maps and on the location indicated in the vicinity map provided.",
                "with_coordinates": "All hazard assessments are based on the latest available hazard maps and on the location indicated by the coordinates provided."
            },
            "nearest_volcano": {
                "single": "{volcano_name} Volcano is the nearest identified active volcano to the site/s."
            },
            "ashfall": {
                "template": "In case of future eruptions of {volcano_name} Volcano and other nearby volcanoes, the site/s may be affected by tephra fall/ ashfall depending on the height of the eruption plume and prevailing wind direction at the time of eruption. Generally, tephra fall/ ashfall is thicker near the eruption center and thins away from the volcano. Ash can cause widespread infrastructural, agricultural, aircraft and property damage, and negative health impacts."
            },
            "supersedes": {
                "single": "This hazard assessment supersedes any previous assessment made by this office regarding the site."
            }
        },
        "distance_rules": {
            "outside_safe_zone": {
                "condition": "distance_km > 50",
                "explanation": "Considering the distance of the site from the volcano, the site is safe from volcanic hazards such as pyroclastic density currents, lava flows, and ballistic projectiles that may originate from the volcano.",
                "recommendation": ""
            }
        },
        "pdz_danger_zone": {
            "name": "Permanent Danger Zone",
            "explanation": "The Permanent Danger Zone (PDZ) is a zone that can always be affected by small-scale eruptions of {volcano_name} Volcano. Human settlement is not recommended within the PDZ.",
            "conditions": {
                "inside": "The site is inside the {radius}-kilometer Permanent Danger Zone of {volcano_name} volcano.",
                "outside": "The site is outside the {radius}-kilometer Permanent Danger Zone of {volcano_name} volcano.",
                "pinatubo_inside": "The site is inside the 10-kilometer danger zone of Pinatubo volcano.",
                "pinatubo_outside": "The site is outside the 10-kilometer danger zone of Pinatubo volcano."
            },
            "special_cases": {
                "kanlaon": { "radius_km": 4.0 },
                "mayon": { "radius_km": 6.0 },
                "pinatubo": { "radius_km": 10.0 },
                "bulusan": { "radius_km": 4.0 },
                "hibok-hibok": { "radius_km": 4.0 },
                "taal": { "explanation": "Taal Volcano Island is designated as the Permanent Danger Zone of the volcano." }
            }
        },
        "lava_flow": {
            "name": "Lava Flow",
            "explanation": "Lava flows are rivers of hot molten rock that can damage built environments and can make lands unusable for a long period of time.",
            "recommendation": "Avoidance is recommended for sites that may potentially be affected by primary volcanic hazards, especially PDCs (pyroclastic density currents) and lava flows.",
            "policy": { "show_explanation_if_safe": false },
            "conditions": {
                "safe": "Safe",
                "prone": "Prone",
                "highly_prone": "Highly Prone",
                "least_prone": "Least Prone"
            }
        },
        "pyroclastic_density_current": {
            "name": "Pyroclastic Density Currents (PDC)",
            "explanation": "Pyroclastic Density Currents (PDCs), such as flows, surges and base surges, are turbulent, fast-moving hot mixtures of volcanic fragments and gas that sweep down/away from an erupting volcano. PDCs can cause loss of life, extreme physical injuries, burial, and damages to agricultures, livestocks, and properties.",
            "recommendation": "Avoidance is recommended for sites that may potentially be affected by primary volcanic hazards, especially PDCs (pyroclastic density currents) and lava flows.",
            "policy": { "show_explanation_if_safe": false },
            "conditions": {
                "safe": "Safe",
                "prone": "Prone",
                "susceptible": "Susceptible"
            }
        },
        "base_surge": {
            "name": "Base Surge",
            "policy": { "show_explanation_if_safe": false },
            "conditions": {
                "safe": "Safe",
                "prone": "Prone",
                "buffer_zone": "Prone; Within the buffer zone"
            },
            "applies_to": ["Taal"]
        },
        "ballistic_projectiles": {
            "name": "Ballistic Projectiles",
            "explanation": "Ballistic projectiles are fragments thrown at a close distance from the vent/crater of an erupting volcano. Ballistic projectiles can cause loss of life, physical injuries, and damage to properties due to forceful impact when hitting the ground.",
            "policy": { "show_explanation_if_safe": false },
            "conditions": {
                "safe": "Safe",
                "prone": "Prone"
            },
            "applies_to": ["Hibok-Hibok", "Taal"]
        },
        "lahar": {
            "name": "Lahar",
            "explanation": "Lahars are rapidly flowing mixtures of volcanic sediments and water in rivers that drain down volcanoes, typically produced by prolonged and intense rainfall. Lahars can cause extensive burial or washout of communities, physical injuries that could lead to loss of life, damages to the natural environment, agriculture, livestocks, infrastructure, properties, and long-term flooding and siltation in river systems.",
            "recommendation": "Lahar threat to people's lives can be addressed by 1) observing or implementing legal easement adjacent to river banks, as provided in existing laws, ordinances and land-use plans, and 2) community preparedness and evacuation plan. At-risk communities must learn to evacuate themselves when lahar threats are imminent.",
            "policy": { "show_explanation_if_safe": false },
            "conditions": {
                "safe": "Safe",
                "prone": "Prone",
                "highly_prone": "Highly Prone",
                "moderately_prone": "Moderately Prone",
                "least_prone": "Least Prone"
            }
        },
        "volcanic_tsunami": {
            "name": "Volcanic Tsunami",
            "explanation": "Volcanic tsunami can be generated by the sudden displacement of sea/lake water by the entry of large masses of volcanic material, underwater explosion, and/or rapid ground deformation during volcanic activity. Volcanic tsunamis can cause inundation and washout of communities, drowning, physical injuries, and damage to infrastructure and properties.",
            "recommendation": "Tsunami threat related to the volcanic unrests can be addressed by community preparedness and tsunami evacuation plan, with special focus on shoreline communities.",
            "policy": { "show_explanation_if_safe": false },
            "conditions": {
                "safe": "Safe",
                "prone": "Prone"
            },
            "applies_to": ["Taal", "Iriga"]
        },
        "fissure": {
            "name": "Fissure (Volcano-Related)",
            "explanation": "Volcanic fissures identified are based on results from detailed field investigations. Hazard assessment may change as DOST-PHIVOLCS scientists gather more information on fissure occurrences.",
            "recommendation": "For land-use planning and disaster risk reduction purposes, at least 5 meters on both sides of the fissure or at the edge of the deformation zone may be considered as a Zone of Avoidance.",
            "policy": { "show_explanation_if_safe": true },
            "conditions": {
                "safe": "Approximately {distance} kilo/meters {direction} of a mapped fissure",
                "transected": "Prone; Transected at the {portion} portion by a mapped fissure"
            }
        }
    },
    "common_boilerplate": {
        "qr_validation": "QR code included in this document may be scanned to validate the authenticity of this Hazard Assessment Report.",
        "analysis_note": "Hazard assessments reflected in this document may contain additional analysis conducted by researchers from the Institute.",
        "online_platforms": "In some areas, hazard assessment may be updated as new data become available for interpretation or as a result of major topographic changes due to onset of natural events. To ensure up-to-date information and quick hazards assessment, access DOST-PHIVOLCS' online platforms. For point-specific location, use HazardHunterPH (https://hazardhunter.georisk.gov.ph), for LGU-based information, use GeoAnalyticsPH (https://geoanalytics.georisk.gov.ph).",
        "site_specific": "For site-specific evaluation or construction of critical facilities, detailed engineering assessment and onsite geotechnical engineering survey may be required."
    }
};
