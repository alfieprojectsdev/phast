// src/lib/har-engine/engine.js
import { AssessmentCategory, HAROutput, HARSection, ExplanationRecommendation, isSafeStatus } from './models.js';

const VOLCANO_TEXT_HINT = 'Expected text like "Approximately 12.3 km northeast of Taal Volcano".';

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
        const warnings = [];

        // 1. Intro statement
        const intro = this._getIntroStatement(assessment);

        // 2. Active Fault
        if (assessment.earthquake.isAssessed('active_fault')) {
            const section = this._processActiveFault(assessment);
            if (section) sections.push(section);
        }

        // 3. Fissure: assessed for Muntinlupa sites under 1 km from a mapped
        // fissure (OHAS 2025 slides 32 and 55).
        if (assessment.earthquake.isAssessed('fissure')) {
            const fissureSection = this._processEarthquakeFissure(assessment);
            if (fissureSection) {
                const gate = this._muntinlupaFissureGate(assessment.site_location, fissureSection);
                if (gate.include) sections.push(fissureSection);
                if (gate.warning) warnings.push(gate.warning);
            }
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
            boilerplate: this.schema.common_boilerplate || {},
            warnings: warnings
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

        // 2. Nearest Volcano Info. Every gate below keys off this distance, so an
        // unreadable cell is an error, not a guess: reading it as 0 km put the
        // site inside every gate and named the volcano "Unknown Volcano".
        const volcanoInfo = this._parseNearestVolcano(assessment);
        if (!volcanoInfo) {
            throw new Error(`Could not read the nearest active volcano cell: "${assessment.volcano.nearest_active_volcano || ''}". ${VOLCANO_TEXT_HINT}`);
        }
        const volcanoName = volcanoInfo.name;
        const distanceKm = volcanoInfo.distance;
        const warnings = [];

        // Add "X Volcano is the nearest..."
        common.push(ExplanationRecommendation.fromParts({
            explanation: this.schema.volcano_rules['common']['nearest_volcano']['single'].replace('{volcano_name}', volcanoName)
        }));

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
            if (this._appliesTo('base_surge', volcanoName)) {
                const surge = this._processBaseSurge(assessment);
                if (surge) sections.push(surge);
            }

            // Volcanic Tsunami: gated by applies_to, but a status the assessor
            // entered is never dropped silently. The list may lag behind the maps,
            // so the assessor gets a warning to check.
            const vTsu = isPinatubo ? null : this._processVolcanicTsunami(assessment);
            if (vTsu) {
                if (this._appliesTo('volcanic_tsunami', volcanoName)) {
                    sections.push(vTsu);
                } else {
                    warnings.push(this._notApplicableWarning('volcanic_tsunami', vTsu, volcanoName));
                }
            }

            // Fissure: the template applies it to sites in the Taal-area municipalities,
            // and its reporting note always goes with it (HAR Templates docx p12-13).
            const fissure = this._processVolcanoFissure(assessment, volcanoName, distanceKm);
            if (fissure) {
                const gate = this._taalFissureGate(assessment.site_location, volcanoName, fissure);
                if (gate.include) {
                    const note = this.schema.volcano_rules.fissure.special_cases?.taal?.reporting;
                    if (note) fissure.notes.push(note);
                    sections.push(fissure);
                }
                if (gate.warning) warnings.push(gate.warning);
            }
        }

        // 12. PAV (Potentially Active Volcano) — AV vs PAV conflict rules
        if (assessment.volcano.nearest_pav && assessment.volcano.nearest_pav !== "--") {
            const pavInfo = this._parseVolcanoText(assessment.volcano.nearest_pav);
            if (!pavInfo) {
                throw new Error(`Could not read the nearest potentially active volcano cell: "${assessment.volcano.nearest_pav}". ${VOLCANO_TEXT_HINT} Use "--" if there is none.`);
            }
            const pavDistanceKm = pavInfo.distance;
            const bothWithin50 = pavDistanceKm < 50.0 && distanceKm < 50.0;
            const pavIsNearer  = pavDistanceKm < distanceKm;

            // Rule: if PAV is nearer than AV (both < 50 km) → assess both + flag VOOD.
            // Rule: if AV is nearer (both < 50 km) → AV only, skip PAV.
            // Rule: if both > 50 km → AV only (already handled by isDistant above).
            const pavStatement = this._getPavStatement(pavInfo.name, assessment.volcano.pav_has_hazard_map);
            if (bothWithin50 && pavIsNearer) {
                common.push(pavStatement);
                common.push(ExplanationRecommendation.fromParts({
                    recommendation: "The Potentially Active Volcano is nearer to the site than the Active Volcano. Please consult the Volcano Officer of the Day (VOOD) for further guidance before issuing this assessment."
                }));
            } else if (!bothWithin50 && pavDistanceKm < 50.0) {
                // Edge case: PAV < 50 km but AV > 50 km — include PAV assessment.
                common.push(pavStatement);
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
            boilerplate: this.schema.common_boilerplate || {},
            warnings: warnings
        });
    }

    _appliesTo(ruleKey, volcanoName) {
        const list = this.schema.volcano_rules[ruleKey]?.applies_to;
        if (!list) return true;
        const name = volcanoName.toLowerCase();
        return list.some(v => name.includes(v.toLowerCase()));
    }

    _notApplicableWarning(ruleKey, section, volcanoName) {
        const list = this.schema.volcano_rules[ruleKey].applies_to.join(', ');
        return `Left out ${section.heading} ("${section.assessment}"): rules.js applies it only to ${list}. ` +
            `If ${volcanoName} Volcano has a ${section.heading.toLowerCase()} map, add it to ${ruleKey}.applies_to.`;
    }

    // Decides whether a volcanic fissure section is used. Matching is on
    // province + municipality, because TALISAY and SAN NICOLAS also exist
    // outside Batangas. With no readable location, fall back to the nearest
    // volcano being Taal and say so.
    _taalFissureGate(siteLocation, volcanoName, section) {
        const taal = this.schema.volcano_rules.fissure.special_cases?.taal || {};
        const list = (taal.municipalities || []).join(', ');
        const where = `${list} (${taal.province || 'BATANGAS'})`;
        const norm = s => this._normPlace(s);
        const municipality = norm(siteLocation?.municipality);
        const province = norm(siteLocation?.province);

        if (municipality && province) {
            if (province === norm(taal.province) && (taal.municipalities || []).includes(municipality)) {
                return { include: true };
            }
            return {
                include: false,
                warning: `Left out ${section.heading} ("${section.assessment}"): the template uses it only for sites in ${where}, ` +
                    `and this site is in ${siteLocation.municipality}, ${siteLocation.province}.`,
            };
        }
        if (this._appliesTo('fissure', volcanoName)) {
            return {
                include: true,
                warning: `Included ${section.heading} because the nearest volcano is Taal, but the site's municipality couldn't be read. ` +
                    `The template uses it only for sites in ${where}; check before issuing.`,
            };
        }
        return { include: false, warning: this._notApplicableWarning('fissure', section, volcanoName) };
    }

    // "City of Muntinlupa", "Muntinlupa City" and "MUNTINLUPA" all compare equal.
    _normPlace(s) {
        return (s || '').toUpperCase()
            .replace(/\bCITY OF\b|\bMUNICIPALITY OF\b|\bCITY\b/g, '')
            .replace(/\s+/g, ' ').trim();
    }

    // Decides whether an earthquake fissure section is used. The earthquake
    // assessment measures fissures only for Muntinlupa (OHAS 2025 slide 32);
    // Taal-area fissures go in the volcano assessment. Matching is on the
    // municipality alone: Muntinlupa's province reads differently from request
    // to request (Metro Manila, NCR), and no other municipality has that name.
    // No reporting note: the templates give one only for Taal.
    _muntinlupaFissureGate(siteLocation, section) {
        const muntinlupa = this.schema.earthquake_rules.fissure.special_cases?.muntinlupa || {};
        const towns = muntinlupa.municipalities || ['MUNTINLUPA'];
        const municipality = this._normPlace(siteLocation?.municipality);

        if (!municipality) {
            return {
                include: true,
                warning: `Included ${section.heading} although the site's municipality couldn't be read. ` +
                    `The earthquake assessment uses it only for sites in ${towns.join(', ')}; check before issuing.`,
            };
        }
        if (towns.includes(municipality)) {
            return { include: true };
        }

        const taal = this.schema.volcano_rules.fissure.special_cases?.taal || {};
        const inTaalArea = this._normPlace(siteLocation.province) === this._normPlace(taal.province) &&
            (taal.municipalities || []).includes(municipality);
        return {
            include: false,
            warning: `Left out ${section.heading} ("${section.assessment}"): the earthquake assessment uses it only for sites in ${towns.join(', ')}, ` +
                `and this site is in ${siteLocation.municipality}, ${siteLocation.province}.` +
                (inTaalArea ? ' Fissures in the Taal area go in the Volcano report.' : ''),
        };
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

        if (isSafeStatus(status) && !showIfSafe) {
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
        // An explicit distance wins; otherwise read it from the status text, which
        // the fissure templates write as "Approximately {distance} meters ...".
        const distM = assessment.earthquake.fissure_distance_m ?? this._parseDistanceM(status);
        if (distM !== null && distM > 1000) return null;

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

    // Returns null when the text doesn't match; callers decide what that means.
    _parseVolcanoText(text) {
        const pattern = /Approximately\s+([\d.]+)\s*(?:km|kilometers?)\s+(\w+)\s+of\s+(.+?)\s+Volcano/i;
        const match = (text || "").match(pattern);
        if (!match) return null;
        const distance = parseFloat(match[1]);
        if (isNaN(distance)) return null;
        return { distance, direction: match[2], name: match[3] };
    }

    // "Approximately 800 meters ...", "... 3 meter/s (or less) ...", "1.2 km" → metres.
    _parseDistanceM(text) {
        const match = (text || "").match(/Approximately\s+([\d,.]+)\s*(kilometers?|km|meter\/s|meters?|m)\b/i);
        if (!match) return null;
        const value = parseFloat(match[1].replace(/,/g, ''));
        if (isNaN(value)) return null;
        return /^k/i.test(match[2]) ? value * 1000 : value;
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
                // No PDZ radius configured. The template's "delineated 10-kilometer radius"
                // sentence is only for a volcano with no hazard map (docx p12, line 3*).
                const fallback = rule.conditions.no_pdz_within_10km;
                if (fallback && distanceKm < 10 && assessment.volcano.av_has_hazard_map === false) {
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
            const rule = this.schema.volcano_rules['lahar'];
            if (!rule) return null;

            // Pinatubo zones and Mayon categories get their own explanation instead of
            // the generic one. Zones 4-5 read "safe from lahars but susceptible ...",
            // so a named zone always renders.
            const special = this._laharSpecialExplanation(volcanoName, status);
            if (!special && !this._shouldRenderSection('lahar', status, this.schema.volcano_rules)) {
                return null;
            }

            const expRec = ExplanationRecommendation.fromParts({
                explanation: special || rule.explanation,
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

    // Projection sentence plus the definitions for the zones (Pinatubo) or
    // categories (Mayon) named in the status, as in HAR Templates docx p13-14.
    // Null when the volcano has no special block or the status names none.
    _laharSpecialExplanation(volcanoName, status) {
        if (typeof status !== 'string') return null;
        const cases = this.schema.volcano_rules.lahar?.special_cases || {};
        const name = volcanoName.toLowerCase();
        const s = status.toLowerCase();
        let definitions = [];
        let block = null;

        if (name.includes('pinatubo') && cases.pinatubo) {
            block = cases.pinatubo;
            // "Zone 1", "Zones 2 and 3", "Zones 2 to 4" / "Zones 2-4" (a range).
            const zones = new Set();
            for (const m of s.matchAll(/zones?\s*([1-5](?:\s*(?:,|and|&|to|-)\s*[1-5])*)/g)) {
                for (const r of m[1].matchAll(/([1-5])(?:\s*(?:to|-)\s*([1-5]))?/g)) {
                    const a = Number(r[1]), b = Number(r[2] || r[1]);
                    for (let z = Math.min(a, b); z <= Math.max(a, b); z++) zones.add(String(z));
                }
            }
            definitions = [...zones].sort().map(z => block.zones[z]).filter(Boolean);
        } else if (name.includes('mayon') && cases.mayon) {
            block = cases.mayon;
            definitions = Object.entries(block.categories)
                .filter(([category]) => s.includes(category))
                .map(([, text]) => text);
        }
        if (!block || definitions.length === 0) return null;
        return [block.projection, ...definitions].join(' ');
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
            // Statement 4/5b in the template is the development sentence followed by the buffer.
            const expRec = ExplanationRecommendation.fromParts({
                explanation: rule.explanation,
                recommendation: [rule.development, rule.recommendation].filter(Boolean).join(' ')
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

    _getPavStatement(pavName, hasHazardMap) {
        const pav = this.schema.volcano_rules.pav;
        const template = hasHazardMap ? pav.with_hazard_map : pav.no_hazard_map;
        return ExplanationRecommendation.fromParts({ explanation: template.replace('{pav_name}', pavName) });
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
        // "Largely Safe, Partly Susceptible" is susceptible: only a plain "Safe" isn't.
        if (isSafeStatus(liqStatus)) return false;
        const s = liqStatus.toLowerCase();
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
