// src/lib/har-engine/engine.js
import { AssessmentCategory, HAROutput, HARSection, ExplanationRecommendation } from './models.js';

export class DecisionEngine {
    constructor(schema) {
        this.schema = schema;
    }

    processAssessment(assessment) {
        if (assessment.category === AssessmentCategory.EARTHQUAKE) {
            return this.processEarthquakeAssessment(assessment);
        } else if (assessment.category === AssessmentCategory.VOLCANO) {
            return this.processVolcanoAssessment(assessment);
        } else {
            throw new Error(`Unknown assessment category: ${assessment.category}`);
        }
    }

    processEarthquakeAssessment(assessment) {
        if (!assessment.hasEarthquakeAssessment()) {
            throw new Error("Assessment missing earthquake data");
        }

        let sections = [];

        // 1. Intro statement
        const intro = this._getIntroStatement(assessment);

        // 2. Active Fault
        if (assessment.earthquake.isAssessed('active_fault')) {
            const section = this._processActiveFault(assessment);
            if (section) sections.push(section);
        }

        // 3. Fissure (if applicable)
        if (assessment.earthquake.isAssessed('fissure')) {
            const fissureSection = this._processEarthquakeFissure(assessment);
            if (fissureSection) sections.push(fissureSection);
        }

        // 4. EIL
        if (assessment.earthquake.isAssessed('landslide')) {
            const section = this._processEil(assessment);
            if (section) sections.push(section);
        }

        // 5. Tsunami
        if (assessment.earthquake.isAssessed('tsunami')) {
            const section = this._processTsunami(assessment);
            if (section) sections.push(section);
        }

        // 6. Ground Shaking and Liquefaction Mitigation
        const gsRules = this.schema.earthquake_rules.common?.ground_shaking || {};
        const gsText = gsRules.default || "All sites may be affected by strong ground shaking.";
        const liqStatus = assessment.earthquake?.liquefaction;
        const isLiqSusceptible = this._isLiqSusceptible(liqStatus);
        const mitigationText = isLiqSusceptible
            ? this.schema.earthquake_rules['common']['ground_shaking_liquefaction_combined']['text']
            : (this.schema.earthquake_rules['common']['ground_shaking_mitigation_only']?.['text']
               || this.schema.earthquake_rules['common']['ground_shaking_liquefaction_combined']['text']);
        const common = [
            ExplanationRecommendation.fromParts({ explanation: gsText }),
            ExplanationRecommendation.fromParts({ recommendation: mitigationText })
        ];

        // 7. Supersedes statement
        const supersedes = this._getSupersedesStatement(true, AssessmentCategory.EARTHQUAKE);

        return new HAROutput({
            category: AssessmentCategory.EARTHQUAKE,
            intro: intro,
            sections: sections,
            common_statements: common,
            supersedes: supersedes,
            additional_recommendations: [],
            boilerplate: this.schema.common_boilerplate || {}
        });
    }

    processVolcanoAssessment(assessment) {
        if (!assessment.hasVolcanoAssessment()) {
            throw new Error("Assessment missing volcano data");
        }

        const sections = [];
        const common = [];

        // 1. Intro
        const intro = this._getIntroStatement(assessment);

        // 2. Nearest Volcano Info
        const volcanoInfo = this._parseNearestVolcano(assessment);
        const volcanoName = volcanoInfo.name || 'Unknown';
        const distanceKm = volcanoInfo.distance || 0.0;

        // Add "X Volcano is the nearest..."
        if (volcanoName !== 'Unknown') {
            const nearestStatement = ExplanationRecommendation.fromParts({
                explanation: this.schema.volcano_rules['common']['nearest_volcano']['single'].replace('{volcano_name}', volcanoName)
            });
            common.push(nearestStatement);
        }

        // 3. Check Distance Rule (>50km or outside watershed)
        const isDistant = distanceKm > 50.0 || assessment.volcano.outside_watershed === true;

        if (isDistant) {
            // INJECT PREAMBLE: Replaces specific hazard sections.
            // Island volcanoes (e.g. Biliran, Hibok-Hibok) use a shorter variant.
            const distantRules = this.schema.volcano_rules['distance_rules'];
            const preambleText = assessment.volcano.is_island_volcano
                ? (distantRules['outside_safe_zone_island']?.explanation || distantRules['outside_safe_zone']['explanation'])
                : distantRules['outside_safe_zone']['explanation'];
            common.push(ExplanationRecommendation.fromParts({ explanation: preambleText }));
        }

        // 4-11. Process Hazards (Only if NOT distant)
        if (!isDistant) {
            // PDZ (returns common statements, not a section)
            const pdzStatements = this._processPdz(assessment, volcanoName, distanceKm);
            pdzStatements.forEach(stmt => common.push(stmt));

            // Lahar
            const lahar = this._processLahar(assessment, volcanoName);
            if (lahar) sections.push(lahar);

            // PDC
            const pdc = this._processPyroclasticFlow(assessment);
            if (pdc) sections.push(pdc);

            // Pinatubo: only lahar confirmed; lava flow, ballistic, volcanic tsunami not applicable
            const isPinatubo = volcanoName.toLowerCase().includes('pinatubo');

            // Lava Flow
            if (!isPinatubo) {
                const lava = this._processLavaFlow(assessment);
                if (lava) sections.push(lava);
            }

            // Ballistic
            if (!isPinatubo) {
                const ballistic = this._processBallisticProjectiles(assessment);
                if (ballistic) sections.push(ballistic);
            }

            // Base Surge (schema-driven applies_to check)
            const baseSurgeRule = this.schema.volcano_rules['base_surge'];
            const baseSurgeAppliesTo = baseSurgeRule?.applies_to || [];
            if (baseSurgeAppliesTo.some(v => volcanoName.toLowerCase().includes(v.toLowerCase()))) {
                const surge = this._processBaseSurge(assessment);
                if (surge) sections.push(surge);
            }

            // Volcanic Tsunami (not applicable for Pinatubo)
            if (!isPinatubo) {
                const vTsu = this._processVolcanicTsunami(assessment);
                if (vTsu) sections.push(vTsu);
            }

            // Fissure
            const fissure = this._processVolcanoFissure(assessment, volcanoName, distanceKm);
            if (fissure) sections.push(fissure);
        }

        // 12. PAV (Potentially Active Volcano) — AV vs PAV conflict rules
        if (assessment.volcano.nearest_pav && assessment.volcano.nearest_pav !== "--") {
            const pavInfo = this._parseVolcanoText(assessment.volcano.nearest_pav);
            const pavDistanceKm = pavInfo.distance;
            const bothWithin50 = pavDistanceKm < 50.0 && distanceKm < 50.0;
            const pavIsNearer  = pavDistanceKm < distanceKm;

            // Rule: if PAV is nearer than AV (both < 50 km) → assess both + flag VOOD.
            // Rule: if AV is nearer (both < 50 km) → AV only, skip PAV.
            // Rule: if both > 50 km → AV only (already handled by isDistant above).
            if (bothWithin50 && pavIsNearer) {
                common.push(this._getPavStatement(assessment.volcano.nearest_pav));
                common.push(ExplanationRecommendation.fromParts({
                    recommendation: "The Potentially Active Volcano is nearer to the site than the Active Volcano. Please consult the Volcano Officer of the Day (VOOD) for further guidance before issuing this assessment."
                }));
            } else if (!bothWithin50 && pavDistanceKm < 50.0) {
                // Edge case: PAV < 50 km but AV > 50 km — include PAV assessment.
                common.push(this._getPavStatement(assessment.volcano.nearest_pav));
            }
            // else: AV is nearer or both > 50 km — PAV not assessed.
        }

        // 13. Ashfall (Always included)
        const ashfallStatement = this._getAshfallStatement(volcanoName);
        common.push(ashfallStatement);

        // 14. Supersedes
        const supersedes = this._getSupersedesStatement(true, AssessmentCategory.VOLCANO);

        // Add avoidance recommendation if not distant and hazards are present
        if (!isDistant && this._checkNeedsAvoidance(assessment)) {
            const avoidance = this._getAvoidanceRecommendation();
            common.push(avoidance);
        }

        return new HAROutput({
            category: AssessmentCategory.VOLCANO,
            intro: intro,
            sections: sections,
            common_statements: common,
            supersedes: supersedes,
            additional_recommendations: [],
            boilerplate: this.schema.common_boilerplate || {}
        });
    }

    _getIntroStatement(assessment) {
        const categoryRules = assessment.category === AssessmentCategory.EARTHQUAKE
            ? this.schema.earthquake_rules
            : this.schema.volcano_rules;
        const introTemplates = categoryRules.common?.intro || {};

        if (assessment.vicinity_map_provided) {
            return introTemplates.with_vicinity_map || "All hazard assessments are based on the latest available hazard maps and on the location indicated in the vicinity map provided.";
        } else {
            return introTemplates.with_coordinates || "All hazard assessments are based on the latest available hazard maps and on the location indicated by the coordinates provided.";
        }
    }

    _shouldRenderSection(hazardKey, status, categoryRules) {
        if (!status || status === "--" || status === "") return false;

        const rule = categoryRules[hazardKey];
        if (!rule) return false;

        const showIfSafe = rule.policy?.show_explanation_if_safe ?? true;

        const isSafe = typeof status === 'string' && status.toLowerCase().includes("safe");

        if (isSafe && !showIfSafe) {
            return false;
        }
        return true;
    }

    _processActiveFault(assessment) {
        const status = assessment.earthquake.active_fault;
        const rule = this.schema.earthquake_rules['active_fault'];
        const expRec = ExplanationRecommendation.fromParts({
            explanation: rule.explanation,
            recommendation: rule.recommendation
        });
        return new HARSection(
            "Ground Rupture",
            status,
            expRec
        );
    }

    _processEarthquakeFissure(assessment) {
        const status = assessment.earthquake.fissure;
        if (!status || status === "--") return null;

        // Enforce the 1 km trigger declared in the schema. If the distance is known
        // and exceeds 1 000 m, suppress the section entirely (not within trigger range).
        const distM = assessment.earthquake.fissure_distance_m;
        if (distM !== null && distM !== undefined && distM > 1000) return null;

        const rule = this.schema.earthquake_rules['fissure'];
        const expRec = ExplanationRecommendation.fromParts({
            explanation: rule.explanation,
            recommendation: rule.recommendation
        });
        return new HARSection(
            "Fissure (Earthquake-Related)",
            status,
            expRec
        );
    }

    _processEil(assessment) {
        const status = assessment.earthquake.landslide;
        if (!this._shouldRenderSection('earthquake_induced_landslide', status, this.schema.earthquake_rules)) {
            return null;
        }
        const rule = this.schema.earthquake_rules['earthquake_induced_landslide'];
        const expRec = ExplanationRecommendation.fromParts({
            explanation: rule.explanation || "",
            recommendation: rule.recommendation
        });
        return new HARSection(
            "Earthquake-Induced Landslide",
            status,
            expRec
        );
    }

    _processTsunami(assessment) {
        const status = assessment.earthquake.tsunami;
        if (!this._shouldRenderSection('tsunami', status, this.schema.earthquake_rules)) {
            return null;
        }
        const rule = this.schema.earthquake_rules['tsunami'];
        const expRec = ExplanationRecommendation.fromParts({
            explanation: rule.explanation || "",
            recommendation: rule.recommendation
        });
        return new HARSection(
            "Tsunami",
            status,
            expRec
        );
    }

    _parseVolcanoText(text) {
        const pattern = /Approximately\s+([\d.]+)\s*(?:km|kilometers)\s+(\w+)\s+of\s+(.+?)\s+Volcano/i;
        const match = (text || "").match(pattern);
        if (match) {
            return { distance: parseFloat(match[1]), direction: match[2], name: match[3] };
        }
        return { distance: 0.0, direction: 'unknown', name: 'Unknown Volcano' };
    }

    _parseNearestVolcano(assessment) {
        return this._parseVolcanoText(assessment.volcano.nearest_active_volcano || "");
    }

    _processPdz(assessment, volcanoName, distanceKm) {
        try {
            const rule = this.schema.volcano_rules['pdz_danger_zone'];
            if (!rule) return [];

            const volcanoLower = volcanoName.toLowerCase();
            const specialCases = rule.special_cases || {};

            let radiusKm = null;
            let insideTemplate = rule.conditions.inside;
            let outsideTemplate = rule.conditions.outside;

            // Check for Pinatubo special case first
            if (volcanoLower.includes("pinatubo")) {
                radiusKm = specialCases.pinatubo?.radius_km || 10.0;
                insideTemplate = rule.conditions.pinatubo_inside;
                outsideTemplate = rule.conditions.pinatubo_outside;
            } else if (volcanoLower.includes("taal")) {
                // Taal: The entire Volcano Island IS the PDZ
                const taalExplanation = specialCases.taal?.explanation ||
                    "Taal Volcano Island is designated as the Permanent Danger Zone of the volcano.";
                return [ExplanationRecommendation.fromParts({ explanation: taalExplanation })];
            } else {
                // Generic volcano - look up radius from special_cases
                for (const volcanoKey in specialCases) {
                    if (volcanoLower.includes(volcanoKey.toLowerCase())) {
                        const volcanoConfig = specialCases[volcanoKey];
                        if (volcanoConfig && volcanoConfig.radius_km) {
                            radiusKm = volcanoConfig.radius_km;
                        }
                        break;
                    }
                }
            }

            if (radiusKm === null) {
                // Generic fallback: no specific PDZ radius configured but site is close.
                const fallback = rule.conditions.no_pdz_within_10km;
                if (fallback && distanceKm < 10) {
                    return [ExplanationRecommendation.fromParts({ explanation: fallback })];
                }
                return [];
            }

            const isInside = distanceKm < radiusKm;
            const statements = [];

            // Statement 1: PDZ status
            let statusText = isInside ? insideTemplate : outsideTemplate;
            statusText = statusText
                .replace('{radius}', parseInt(radiusKm))
                .replace('{volcano_name}', volcanoName);
            statements.push(ExplanationRecommendation.fromParts({ explanation: statusText }));

            // Statement 2: PDZ explanation
            const pdzExplanation = rule.explanation
                .replace('{volcano_name}', volcanoName)
                .replace('{radius}', parseInt(radiusKm));
            statements.push(ExplanationRecommendation.fromParts({ explanation: pdzExplanation }));

            return statements;

        } catch (e) {
            console.error(e);
            return [];
        }
    }

    _processLahar(assessment, volcanoName) {
        try {
            const status = assessment.volcano.lahar;
            if (!this._shouldRenderSection('lahar', status, this.schema.volcano_rules)) {
                return null;
            }

            const rule = this.schema.volcano_rules['lahar'];
            if (!rule) return null;

            const expRec = ExplanationRecommendation.fromParts({
                explanation: rule.explanation,
                recommendation: rule.recommendation
            });

            return new HARSection(
                "Lahar",
                status,
                expRec
            );
        } catch (e) {
            return null;
        }
    }

    _processPyroclasticFlow(assessment) {
        try {
            const status = assessment.volcano.pyroclastic_flow;
            if (!this._shouldRenderSection('pyroclastic_density_current', status, this.schema.volcano_rules)) {
                return null;
            }

            const rule = this.schema.volcano_rules['pyroclastic_density_current'];
            const expRec = ExplanationRecommendation.fromParts({
                explanation: rule.explanation,
                recommendation: rule.recommendation
            });
            return new HARSection(
                "Pyroclastic Density Current",
                status,
                expRec
            );
        } catch (e) {
            return null;
        }
    }

    _processLavaFlow(assessment) {
        try {
            const status = assessment.volcano.lava_flow;
            if (!this._shouldRenderSection('lava_flow', status, this.schema.volcano_rules)) {
                return null;
            }

            const rule = this.schema.volcano_rules['lava_flow'];
            const expRec = ExplanationRecommendation.fromParts({
                explanation: rule.explanation,
                recommendation: rule.recommendation
            });
            return new HARSection(
                "Lava Flow",
                status,
                expRec
            );
        } catch (e) {
            return null;
        }
    }

    _processBallisticProjectiles(assessment) {
        try {
            const status = assessment.volcano.ballistic_projectile;
            if (!this._shouldRenderSection('ballistic_projectiles', status, this.schema.volcano_rules)) {
                return null;
            }

            const rule = this.schema.volcano_rules['ballistic_projectiles'];
            const expRec = ExplanationRecommendation.fromParts({
                explanation: rule.explanation,
                recommendation: rule.recommendation || ""
            });
            return new HARSection(
                "Ballistic Projectiles",
                status,
                expRec
            );
        } catch (e) {
            return null;
        }
    }

    _processBaseSurge(assessment) {
        try {
            const status = assessment.volcano.base_surge;
            if (!this._shouldRenderSection('base_surge', status, this.schema.volcano_rules)) {
                return null;
            }

            const rule = this.schema.volcano_rules['base_surge'];
            const expRec = ExplanationRecommendation.fromParts({
                explanation: rule.explanation || "",
                recommendation: rule.recommendation || ""
            });
            return new HARSection(
                "Base Surge",
                status,
                expRec
            );
        } catch (e) {
            return null;
        }
    }

    _processVolcanicTsunami(assessment) {
        try {
            const status = assessment.volcano.volcanic_tsunami;
            if (!this._shouldRenderSection('volcanic_tsunami', status, this.schema.volcano_rules)) {
                return null;
            }

            const rule = this.schema.volcano_rules['volcanic_tsunami'];
            const expRec = ExplanationRecommendation.fromParts({
                explanation: rule.explanation,
                recommendation: rule.recommendation
            });
            return new HARSection(
                "Volcanic Tsunami",
                status,
                expRec
            );
        } catch (e) {
            return null;
        }
    }

    _processVolcanoFissure(assessment, volcanoName, distanceKm) {
        if (distanceKm > 50.0) return null;
        try {
            const status = assessment.volcano.fissure;
            if (!status || status === "--") return null;

            const rule = this.schema.volcano_rules['fissure'];
            const expRec = ExplanationRecommendation.fromParts({
                explanation: rule.explanation,
                recommendation: rule.recommendation
            });
            return new HARSection(
                "Fissure",
                status,
                expRec
            );
        } catch (e) {
            return null;
        }
    }

    _getPavStatement(pavText) {
        let volcanoName = "Unknown";
        if (pavText.includes("of ") && pavText.includes("Volcano")) {
            const parts = pavText.split("of ")[1];
            volcanoName = parts.split(" Volcano")[0].trim();
        }

        const explanation = `${volcanoName} Volcano is currently classified by DOST-PHIVOLCS as a potentially active volcano, which is morphologically young-looking but with no historical or analytical records of eruption.`;

        return ExplanationRecommendation.fromParts({ explanation: explanation });
    }

    _getAshfallStatement(volcanoName) {
        const template = this.schema.volcano_rules['common']['ashfall']['template'];
        const explanation = template.replace('{volcano_name}', volcanoName);
        return ExplanationRecommendation.fromParts({ explanation: explanation });
    }

    _getAvoidanceRecommendation() {
        const pdcRule = this.schema.volcano_rules['pyroclastic_density_current'];
        const text = pdcRule?.recommendation_alt || pdcRule?.recommendation || "Avoidance is recommended for site/sites that may potentially be affected by pyroclastic density currents (PDCs) and lava flows.";
        return ExplanationRecommendation.fromParts({ recommendation: text });
    }

    _checkNeedsAvoidance(assessment) {
        try {
            const volcano = assessment.volcano;
            if (volcano.lahar && volcano.lahar.toLowerCase().includes('prone')) return true;
            if (volcano.pyroclastic_flow && volcano.pyroclastic_flow.toLowerCase().includes('prone')) return true;
            if (volcano.lava_flow && volcano.lava_flow.toLowerCase().includes('prone')) return true;
            return false;
        } catch (e) {
            return false;
        }
    }

    _isLiqSusceptible(liqStatus) {
        if (!liqStatus || liqStatus === "--") return false;
        const s = liqStatus.toLowerCase();
        if (s.includes("safe")) return false;
        // GMMA-READY: "Low Potential" is treated as non-susceptible for mitigation text.
        if (s.includes("low potential")) return false;
        return true;
    }

    _getSupersedesStatement(singleSite = true, category = null) {
        const rules = (category === AssessmentCategory.VOLCANO)
            ? (this.schema.volcano_rules.common?.supersedes || this.schema.earthquake_rules.common?.supersedes || {})
            : (this.schema.earthquake_rules.common?.supersedes || {});
        return singleSite
            ? (rules.single || "This hazard assessment supersedes any previous assessment made by this office regarding the site.")
            : (rules.multiple || "This hazard assessment supersedes any previous assessment made by this office regarding the sites.");
    }

}
