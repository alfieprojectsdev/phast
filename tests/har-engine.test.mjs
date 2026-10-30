/**
 * har-engine unit tests
 * Run: node --experimental-vm-modules tests/har-engine.test.mjs
 *   or: node tests/har-engine.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { HAZARD_RULES_SCHEMA } from '../src/lib/har-engine/rules.js';
import { DecisionEngine } from '../src/lib/har-engine/engine.js';
import { assessmentFromRow, findCategoryRow, parseSiteLocation, COLUMNS } from '../src/lib/har-engine/table-row.js';
import {
    Assessment,
    AssessmentCategory,
    EarthquakeAssessment,
    VolcanoAssessment,
    isSafeStatus,
} from '../src/lib/har-engine/models.js';

const engine = new DecisionEngine(HAZARD_RULES_SCHEMA);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEqAssessment(overrides = {}) {
    return new Assessment({
        id: 'test-eq',
        category: AssessmentCategory.EARTHQUAKE,
        vicinity_map_provided: false,
        earthquake: {
            active_fault: 'Safe; Approximately 2.1 kilometers North of the West Valley Fault',
            liquefaction: 'Safe',
            landslide: '--',
            tsunami: '--',
            fissure: '--',
            ...overrides,
        },
    });
}

function makeVolcanoAssessment(volcText, overrides = {}) {
    return new Assessment({
        id: 'test-vol',
        category: AssessmentCategory.VOLCANO,
        vicinity_map_provided: false,
        volcano: {
            nearest_active_volcano: volcText,
            nearest_pav: '--',
            fissure: '--',
            lahar: '--',
            pyroclastic_flow: '--',
            base_surge: '--',
            lava_flow: '--',
            ballistic_projectile: '--',
            volcanic_tsunami: '--',
            outside_watershed: false,
            is_island_volcano: false,
            ...overrides,
        },
    });
}

// ─── Earthquake: Liquefaction / GMMA-READY ────────────────────────────────────

describe('Liquefaction — mitigation text selection', () => {
    test('Safe liquefaction → ground shaking mitigation only', () => {
        const out = engine.processAssessment(makeEqAssessment({ liquefaction: 'Safe' }));
        const mitigText = out.common_statements.map(s => s.recommendation).join(' ');
        assert.ok(
            mitigText.includes('National Building Code'),
            'Expected NBC mitigation text'
        );
    });

    test('Susceptible liquefaction → combined mitigation text', () => {
        const out = engine.processAssessment(makeEqAssessment({ liquefaction: 'Susceptible' }));
        const mitigText = out.common_statements.map(s => s.recommendation).join(' ');
        assert.ok(mitigText.includes('liquefaction'), 'Expected liquefaction in combined text');
    });

    test('GMMA-READY Low Potential → treated as safe (mitigation-only text)', () => {
        const out = engine.processAssessment(makeEqAssessment({ liquefaction: 'Low Potential' }));
        const combined = out.common_statements.map(s => s.recommendation).join(' ');
        // Should NOT use the liquefaction-combined text
        const liqCombined = HAZARD_RULES_SCHEMA.earthquake_rules.common.ground_shaking_liquefaction_combined.text;
        const liqOnly = HAZARD_RULES_SCHEMA.earthquake_rules.common.ground_shaking_mitigation_only?.text;
        if (liqOnly) {
            assert.ok(!combined.includes('liquefaction') || combined === liqCombined,
                'Low Potential should not trigger combined liquefaction mitigation');
        }
    });

    test('GMMA-READY Moderate Potential → treated as susceptible', () => {
        assert.ok(engine._isLiqSusceptible('Moderate Potential'));
    });

    test('GMMA-READY High Potential → treated as susceptible', () => {
        assert.ok(engine._isLiqSusceptible('High Potential'));
    });

    test('_isLiqSusceptible: Safe → false', () => {
        assert.equal(engine._isLiqSusceptible('Safe'), false);
    });

    test('_isLiqSusceptible: null / "--" → false', () => {
        assert.equal(engine._isLiqSusceptible(null), false);
        assert.equal(engine._isLiqSusceptible('--'), false);
    });
});

// ─── Earthquake: Fissure 1 km trigger ────────────────────────────────────────

describe('Fissure — 1 km trigger enforcement', () => {
    test('fissure_distance_m null → section rendered regardless (unknown distance)', () => {
        const out = engine.processAssessment(makeEqAssessment({
            fissure: 'Safe; Approximately 500 meters North of a mapped fissure',
            fissure_distance_m: null,
        }));
        const headings = out.sections.map(s => s.heading);
        assert.ok(headings.includes('Fissure (Earthquake-Related)'), 'Should render when distance unknown');
    });

    test('fissure_distance_m 800 → section rendered (within 1 km)', () => {
        const out = engine.processAssessment(makeEqAssessment({
            fissure: 'Safe; Approximately 800 meters North of a mapped fissure',
            fissure_distance_m: 800,
        }));
        const headings = out.sections.map(s => s.heading);
        assert.ok(headings.includes('Fissure (Earthquake-Related)'), 'Should render within 1 km');
    });

    test('fissure_distance_m 1500 → section suppressed (beyond 1 km)', () => {
        const out = engine.processAssessment(makeEqAssessment({
            fissure: 'Safe; Approximately 1.5 kilometers North of a mapped fissure',
            fissure_distance_m: 1500,
        }));
        const headings = out.sections.map(s => s.heading);
        assert.ok(!headings.includes('Fissure (Earthquake-Related)'), 'Should suppress beyond 1 km');
    });

    test('fissure "--" → section never rendered', () => {
        const out = engine.processAssessment(makeEqAssessment({ fissure: '--' }));
        const headings = out.sections.map(s => s.heading);
        assert.ok(!headings.includes('Fissure (Earthquake-Related)'));
    });
});

// ─── Earthquake: Fissure is a Muntinlupa template ────────────────────────────

describe('Fissure — Muntinlupa gate', () => {
    const FISSURE = 'Safe; Approximately 300 meters North of a mapped fissure';
    const at = (municipality, province) => {
        const assessment = makeEqAssessment({ fissure: FISSURE });
        assessment.site_location = municipality === null ? null : { barangay: 'Poblacion', municipality, province };
        return engine.processAssessment(assessment);
    };
    const section = out => out.sections.find(s => s.heading === 'Fissure (Earthquake-Related)');

    test('Muntinlupa site → section with no note (the templates give none) and no warning', () => {
        const out = at('Muntinlupa City', 'Metro Manila');
        assert.ok(section(out));
        assert.deepEqual(section(out).notes, []);
        assert.deepEqual(out.warnings, []);
    });

    test('"City of Muntinlupa" and an NCR province match too', () => {
        const out = at('City of Muntinlupa', 'NCR, Fourth District');
        assert.ok(section(out));
        assert.deepEqual(out.warnings, []);
    });

    test('site outside Muntinlupa → left out with a warning naming the site', () => {
        const out = at('Pasig City', 'Metro Manila');
        assert.equal(section(out), undefined);
        assert.equal(out.warnings.length, 1);
        assert.match(out.warnings[0], /only for sites in MUNTINLUPA, and this site is in Pasig City, Metro Manila\.$/);
    });

    test('Taal-area site → left out, pointing to the Volcano report', () => {
        const out = at('Talisay', 'Batangas');
        assert.equal(section(out), undefined);
        assert.match(out.warnings[0], /Fissures in the Taal area go in the Volcano report\.$/);
    });

    test('unreadable location → kept, with a warning to check', () => {
        const out = at(null);
        assert.ok(section(out));
        assert.match(out.warnings[0], /^Included Fissure \(Earthquake-Related\) although the site's municipality couldn't be read/);
    });

    test('beyond 1 km → no section and no warning, wherever the site is', () => {
        const assessment = makeEqAssessment({ fissure: FISSURE, fissure_distance_m: 1500 });
        assessment.site_location = { barangay: 'Poblacion', municipality: 'Pasig City', province: 'Metro Manila' };
        const out = engine.processAssessment(assessment);
        assert.equal(section(out), undefined);
        assert.deepEqual(out.warnings, []);
    });
});

// ─── Volcano: 50 km gatekeeper ────────────────────────────────────────────────

describe('Volcano — 50 km gatekeeper', () => {
    const DISTANT_TEXT = 'Approximately 75 kilometers North of Mayon Volcano';
    const CLOSE_TEXT   = 'Approximately 4 kilometers North of Mayon Volcano';

    test('> 50 km → distant preamble emitted, no hazard sections', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(DISTANT_TEXT));
        const explanations = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(explanations.includes('safe from volcanic hazards'), 'Expected distant preamble');
        assert.equal(out.sections.length, 0);
    });

    test('< 50 km → no distant preamble', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(CLOSE_TEXT));
        const explanations = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(!explanations.includes('safe from volcanic hazards'), 'Should not have distant preamble');
    });

    test('outside_watershed flag → distant preamble even when < 50 km', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(CLOSE_TEXT, {
            outside_watershed: true,
        }));
        const explanations = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(explanations.includes('safe from volcanic hazards'), 'outside_watershed should trigger gatekeeper');
    });

    test('is_island_volcano → uses shorter island text when distant', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(DISTANT_TEXT, {
            is_island_volcano: true,
        }));
        const explanations = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(explanations.includes('safe from erupted products'), 'Expected island-exception text');
        assert.ok(!explanations.includes('pyroclastic density currents, lava flows'), 'Should NOT use standard distant text');
    });

    test('standard (non-island) distant → standard text, not island text', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(DISTANT_TEXT, {
            is_island_volcano: false,
        }));
        const explanations = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(explanations.includes('pyroclastic density currents, lava flows'), 'Expected standard distant text');
    });
});

// ─── Volcano: AV vs PAV conflict ──────────────────────────────────────────────

describe('Volcano — AV vs PAV conflict rules', () => {
    const AV_30KM  = 'Approximately 30 kilometers North of Mayon Volcano';
    const PAV_10KM = 'Approximately 10 kilometers North of Arayat Volcano';
    const PAV_50KM = 'Approximately 50 kilometers North of Arayat Volcano';
    const PAV_60KM = 'Approximately 60 kilometers North of Arayat Volcano';

    test('PAV nearer than AV (both < 50 km) → PAV assessed + VOOD note', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(AV_30KM, {
            nearest_pav: PAV_10KM,
        }));
        const combined = out.common_statements.map(s => s.explanation + s.recommendation).join(' ');
        assert.ok(combined.includes('potentially active volcano'), 'PAV definition should appear');
        assert.ok(combined.includes('VOOD') || combined.includes('Volcano Officer'), 'VOOD note should appear');
    });

    test('AV nearer than PAV (both < 50 km) → PAV not assessed, no VOOD note', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(AV_30KM, {
            nearest_pav: PAV_50KM,  // PAV at 50 km, AV at 30 km → AV is nearer
        }));
        const combined = out.common_statements.map(s => s.explanation + s.recommendation).join(' ');
        assert.ok(!combined.includes('potentially active volcano'), 'PAV should not appear when AV is nearer');
        assert.ok(!combined.includes('VOOD'), 'No VOOD note when AV is nearer');
    });

    test('Both AV and PAV > 50 km → no PAV assessed', () => {
        const AV_60KM = 'Approximately 60 kilometers North of Mayon Volcano';
        const out = engine.processAssessment(makeVolcanoAssessment(AV_60KM, {
            nearest_pav: PAV_60KM,
        }));
        const combined = out.common_statements.map(s => s.explanation + s.recommendation).join(' ');
        assert.ok(!combined.includes('potentially active volcano'), 'No PAV when both > 50 km');
    });

    test('nearest_pav "--" → no PAV section', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(AV_30KM, {
            nearest_pav: '--',
        }));
        const combined = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(!combined.includes('potentially active volcano'));
    });
});

// ─── Volcano: PDZ no-radius fallback ──────────────────────────────────────────

describe('Volcano — PDZ no-PDZ-within-10km fallback', () => {
    // Use a volcano name with no special_cases entry to trigger the null-radius path
    const UNKNOWN_CLOSE = 'Approximately 5 kilometers North of Unnamed Volcano';
    const UNKNOWN_FAR   = 'Approximately 15 kilometers North of Unnamed Volcano';

    test('Unknown volcano < 10 km with no hazard map → no-PDZ fallback text emitted', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(UNKNOWN_CLOSE, { av_has_hazard_map: false }));
        const combined = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(combined.includes('delineated 10-kilometer radius'), 'Expected no-PDZ fallback text');
    });

    test('Unknown volcano < 10 km with a hazard map (default) → no fallback text', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(UNKNOWN_CLOSE));
        const combined = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(!combined.includes('delineated 10-kilometer radius'));
    });

    test('Unknown volcano > 10 km → no PDZ fallback, no section', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(UNKNOWN_FAR));
        const combined = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(
            !combined.includes('highly prone to eruptive'),
            'Should not emit PDZ fallback beyond 10 km'
        );
    });
});

// ─── Volcano: Taal special cases ──────────────────────────────────────────────

describe('Volcano — Taal PDZ phrasing', () => {
    const TAAL_CLOSE = 'Approximately 3 kilometers North of Taal Volcano';

    test('Taal → PDZ uses island text, not radius template', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(TAAL_CLOSE));
        const combined = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(combined.includes('Taal Volcano Island'), 'Expected island PDZ text');
        assert.ok(!combined.includes('kilometer Permanent Danger Zone'), 'Should not use radius PDZ text');
    });
});

// ─── Volcano: Pinatubo special cases ──────────────────────────────────────────

describe('Volcano — Pinatubo PDZ phrasing', () => {
    const PINATUBO_CLOSE = 'Approximately 8 kilometers North of Pinatubo Volcano';

    test('Pinatubo inside 10 km → status line uses "10-kilometer danger zone" not radius PDZ template', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(PINATUBO_CLOSE));
        const combined = out.common_statements.map(s => s.explanation).join(' ');
        // The status sentence must use the Pinatubo-specific phrase.
        assert.ok(combined.includes('10-kilometer danger zone'), 'Expected Pinatubo danger zone phrase');
        // The generic PDZ explanation paragraph will still contain "Permanent Danger Zone" — that is
        // correct and expected. What must NOT appear is the radius template "{N}-kilometer Permanent
        // Danger Zone" with an actual number, which would indicate the wrong template was selected.
        assert.ok(!combined.includes('10-kilometer Permanent Danger Zone'), 'Should not use radius PDZ template for Pinatubo');
    });
});

// ─── _parseVolcanoText ────────────────────────────────────────────────────────

describe('_parseVolcanoText', () => {
    test('parses standard format correctly', () => {
        const r = engine._parseVolcanoText('Approximately 12.5 kilometers NW of Mayon Volcano');
        assert.equal(r.distance, 12.5);
        assert.equal(r.name, 'Mayon');
        assert.equal(r.direction, 'NW');
    });

    test('returns null on unparseable input', () => {
        assert.equal(engine._parseVolcanoText('some random string'), null);
    });

    test('returns null for null/empty input', () => {
        assert.equal(engine._parseVolcanoText(null), null);
        assert.equal(engine._parseVolcanoText(''), null);
    });

    test('accepts singular "kilometer"', () => {
        const r = engine._parseVolcanoText('Approximately 1 kilometer east of Taal Volcano');
        assert.equal(r.distance, 1);
        assert.equal(r.name, 'Taal');
    });
});

// ─── rules.js schema integrity ────────────────────────────────────────────────

describe('rules.js — schema integrity', () => {
    test('outside_safe_zone_island key exists', () => {
        assert.ok(HAZARD_RULES_SCHEMA.volcano_rules.distance_rules.outside_safe_zone_island?.explanation);
    });

    test('no_pdz_within_10km key exists', () => {
        assert.ok(HAZARD_RULES_SCHEMA.volcano_rules.pdz_danger_zone.conditions.no_pdz_within_10km);
    });

    test('gmma_ready_conditions block exists on liquefaction', () => {
        const gc = HAZARD_RULES_SCHEMA.earthquake_rules.liquefaction.gmma_ready_conditions;
        assert.ok(gc?.low_potential && gc?.moderate_potential && gc?.high_potential);
    });

    test('gep_thresholds block exists on EIL', () => {
        const gep = HAZARD_RULES_SCHEMA.earthquake_rules.earthquake_induced_landslide.gep_thresholds;
        assert.equal(gep?.slope_safe_max_deg, 15);
        assert.equal(gep?.slope_safe_max_pct, 25);
    });

    test('no_data_low_lying_coastal key exists on tsunami', () => {
        assert.ok(HAZARD_RULES_SCHEMA.earthquake_rules.tsunami.conditions.no_data_low_lying_coastal?.template);
    });

    test('volcanic_tsunami recommendation matches the template (no three-signs sentence)', () => {
        assert.equal(HAZARD_RULES_SCHEMA.volcano_rules.volcanic_tsunami.recommendation,
            'Tsunami threat related to the volcanic unrests can be addressed by community preparedness and tsunami evacuation plan, with special focus on shoreline communities.');
    });

    test('volcano fissure applies_to is Taal only', () => {
        assert.deepEqual(HAZARD_RULES_SCHEMA.volcano_rules.fissure.applies_to, ['Taal']);
    });

    test('EIL and tsunami have no explanation (the templates give only a recommendation)', () => {
        assert.equal(HAZARD_RULES_SCHEMA.earthquake_rules.earthquake_induced_landslide.explanation, undefined);
        assert.equal(HAZARD_RULES_SCHEMA.earthquake_rules.tsunami.explanation, undefined);
    });

    test('volcano hazard text follows the 2025 AV-only template', () => {
        const v = HAZARD_RULES_SCHEMA.volcano_rules;
        assert.match(v.lava_flow.explanation, /can burn and bury land/);
        assert.match(v.pyroclastic_density_current.explanation, /due to burning, impact force, abrasion, asphyxiation/);
        assert.equal(v.pyroclastic_density_current.recommendation,
            'Avoidance is recommended for site/sites that may potentially be affected by pyroclastic density currents (PDCs) and lava flows.');
        assert.equal(v.lava_flow.recommendation, v.pyroclastic_density_current.recommendation);
        assert.match(v.ballistic_projectiles.explanation, /when hitting ground\.$/);
        assert.match(v.lahar.explanation, /damage to built environment, agriculture, livestock/);
        assert.match(v.common.ashfall.template, /agricultural, and property damages, and negative health impacts\.$/);
        for (const text of [v.lahar.explanation, v.pyroclastic_density_current.explanation, v.common.ashfall.template]) {
            assert.ok(!/livestocks|agricultures|aircraft/.test(text), text);
        }
    });
});

// ─── Safe vs compound statuses ────────────────────────────────────────────────

describe('isSafeStatus — compound statuses describe a hazard', () => {
    test('plain safe statuses are safe', () => {
        for (const s of ['Safe', 'safe', 'Safe; Approximately 2.1 kilometers North of the West Valley Fault']) {
            assert.equal(isSafeStatus(s), true, s);
        }
    });

    test('statuses that also name a susceptibility or proneness are not safe', () => {
        for (const s of ['Largely Safe, Partly Susceptible', 'Partly Safe, Largely Susceptible',
            'Partly Safe, Partly Susceptible', 'Largely Safe, Partly Least Susceptible',
            'Zone 4 (safe from lahars but susceptible to sediment-laden stream flows)', 'Partly safe, partly prone']) {
            assert.equal(isSafeStatus(s), false, s);
        }
    });

    test('non-strings are not safe', () => {
        assert.equal(isSafeStatus(null), false);
        assert.equal(isSafeStatus(undefined), false);
    });

    test('EIL "Partly Safe, Largely Susceptible" → EIL section with the avoidance recommendation', () => {
        const out = engine.processAssessment(makeEqAssessment({ landslide: 'Partly Safe, Largely Susceptible' }));
        const eil = out.sections.find(s => s.heading === 'Earthquake-Induced Landslide');
        assert.ok(eil, 'EIL section expected');
        assert.match(eil.explanation_recommendation.recommendation, /^Avoidance is recommended/);
        assert.equal(eil.explanation_recommendation.explanation, '');
    });

    test('Liquefaction "Largely Safe, Partly Susceptible" → combined mitigation sentence', () => {
        const out = engine.processAssessment(makeEqAssessment({ liquefaction: 'Largely Safe, Partly Susceptible' }));
        assert.match(out.common_statements[1].recommendation, /^Ground shaking and liquefaction hazards/);
    });

    test('tsunami section has the recommendation only', () => {
        const out = engine.processAssessment(makeEqAssessment({ tsunami: 'Prone; Within the tsunami inundation zone' }));
        const tsu = out.sections.find(s => s.heading === 'Tsunami');
        assert.equal(tsu.explanation_recommendation.explanation, '');
        assert.match(tsu.explanation_recommendation.recommendation, /three natural signs of tsunami/);
    });
});

// ─── PAV definition variants ──────────────────────────────────────────────────

describe('Volcano — PAV definition with and without a hazard map', () => {
    const AV_30KM  = 'Approximately 30 kilometers North of Mayon Volcano';
    const PAV_10KM = 'Approximately 10 kilometers North of Arayat Volcano';
    const pavText = out => out.common_statements.map(s => s.explanation).find(t => t.includes('potentially active volcano'));

    test('default (no map) → "yet to be determined" variant', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(AV_30KM, { nearest_pav: PAV_10KM }));
        assert.equal(pavText(out),
            'Arayat Volcano is currently classified by DOST-PHIVOLCS as a potentially active volcano, which is morphologically young-looking but with no historical or analytical records of eruption, therefore, its eruptive and hazard potential is yet to be determined.');
    });

    test('pav_has_hazard_map → shorter variant', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(AV_30KM, { nearest_pav: PAV_10KM, pav_has_hazard_map: true }));
        assert.match(pavText(out), /records of eruption\.$/);
    });
});

// ─── Pinatubo and Mayon lahar blocks ──────────────────────────────────────────

describe('Volcano — Pinatubo and Mayon lahar explanations', () => {
    const PINATUBO = 'Approximately 20 kilometers North of Pinatubo Volcano';
    const MAYON    = 'Approximately 9 kilometers North of Mayon Volcano';
    const lahar = out => out.sections.find(s => s.heading === 'Lahar');

    test('Pinatubo "Zone 1" → projection sentence plus the Zone 1 definition', () => {
        const ex = lahar(engine.processAssessment(makeVolcanoAssessment(PINATUBO, { lahar: 'Zone 1' }))).explanation_recommendation.explanation;
        assert.match(ex, /^The lahar hazards assessment for Pinatubo Volcano is a long-term lahar hazard projection/);
        assert.match(ex, /Zone 1 includes areas at high susceptibility/);
        assert.ok(!ex.includes('Zone 2 includes'));
    });

    test('Pinatubo "Zones 2 and 3" → both definitions, in order', () => {
        const ex = lahar(engine.processAssessment(makeVolcanoAssessment(PINATUBO, { lahar: 'Zones 2 and 3' }))).explanation_recommendation.explanation;
        assert.ok(ex.indexOf('Zone 2 includes') > -1 && ex.indexOf('Zone 2 includes') < ex.indexOf('Zone 3 includes'));
    });

    test('Pinatubo "Zones 2 to 4" and "Zones 2-4" → zones 2, 3 and 4', () => {
        for (const status of ['Zones 2 to 4', 'Zones 2-4']) {
            const ex = lahar(engine.processAssessment(makeVolcanoAssessment(PINATUBO, { lahar: status }))).explanation_recommendation.explanation;
            for (const z of [2, 3, 4]) assert.ok(ex.includes(`Zone ${z} `), `${status}: Zone ${z}`);
            assert.ok(!ex.includes('Zone 1 includes') && !ex.includes('Zone 5 are'), status);
        }
    });

    test('Pinatubo "Zone 4" → rendered even though zone 4 is "safe from lahars"', () => {
        const section = lahar(engine.processAssessment(makeVolcanoAssessment(PINATUBO, { lahar: 'Zone 4' })));
        assert.ok(section);
        assert.match(section.explanation_recommendation.explanation, /Zone 4 are areas safe from lahars/);
    });

    test('Mayon "Highly Prone" → Mayon projection plus the highly prone definition', () => {
        const ex = lahar(engine.processAssessment(makeVolcanoAssessment(MAYON, { lahar: 'Highly Prone' }))).explanation_recommendation.explanation;
        assert.match(ex, /^The lahar hazards assessment for Mayon Volcano/);
        assert.match(ex, /Areas highly prone to lahars/);
        assert.ok(!ex.includes('Areas least prone'));
    });

    test('Mayon "Safe" → no lahar section', () => {
        assert.equal(lahar(engine.processAssessment(makeVolcanoAssessment(MAYON, { lahar: 'Safe' }))), undefined);
    });

    test('other volcano "Prone" → generic lahar explanation', () => {
        const ex = lahar(engine.processAssessment(makeVolcanoAssessment('Approximately 9 kilometers North of Kanlaon Volcano', { lahar: 'Prone' }))).explanation_recommendation.explanation;
        assert.match(ex, /^Lahars are rapidly flowing mixtures of volcanic sediment and water/);
    });
});

// ─── Volcano: unreadable volcano cells ────────────────────────────────────────

describe('Volcano — unreadable nearest-volcano cells', () => {
    test('unparseable nearest AV → throws with the expected format, no report', () => {
        assert.throws(
            () => engine.processAssessment(makeVolcanoAssessment('Taal Volcano, about 12 km NE')),
            /nearest active volcano cell: "Taal Volcano, about 12 km NE".*Approximately 12\.3 km/
        );
    });

    test('blank nearest AV → throws', () => {
        assert.throws(() => engine.processAssessment(makeVolcanoAssessment('--')), /nearest active volcano/);
    });

    test('unparseable nearest PAV → throws instead of reading 0 km', () => {
        assert.throws(
            () => engine.processAssessment(makeVolcanoAssessment(
                'Approximately 30 kilometers North of Mayon Volcano', { nearest_pav: 'Arayat, 10 km' }
            )),
            /nearest potentially active volcano cell/
        );
    });

    test('readable cell → named volcano, never "Unknown"', () => {
        const out = engine.processAssessment(makeVolcanoAssessment('Approximately 30 kilometers North of Mayon Volcano'));
        const combined = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(!combined.includes('Unknown'));
        assert.ok(combined.includes('Mayon Volcano is the nearest identified active volcano'));
    });
});

// ─── Volcano: applies_to gating for VTS and VFI ───────────────────────────────

describe('Volcano — applies_to for volcanic tsunami and fissure', () => {
    const TAAL     = 'Approximately 8 kilometers North of Taal Volcano';
    const MAYON    = 'Approximately 8 kilometers North of Mayon Volcano';
    const PINATUBO = 'Approximately 8 kilometers North of Pinatubo Volcano';
    const FISSURE  = 'Approximately 200 meters east of a mapped fissure';
    const headings = out => out.sections.map(s => s.heading);

    test('Taal, VTS prone → section rendered, no warning', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(TAAL, { volcanic_tsunami: 'Prone' }));
        assert.ok(headings(out).includes('Volcanic Tsunami'));
        assert.equal(out.warnings.length, 0);
    });

    test('Mayon, VTS prone → section left out, warning names the volcano and the list', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(MAYON, { volcanic_tsunami: 'Prone' }));
        assert.ok(!headings(out).includes('Volcanic Tsunami'));
        assert.equal(out.warnings.length, 1);
        assert.match(out.warnings[0], /Volcanic Tsunami \("Prone"\).*Taal, Iriga.*Mayon Volcano/);
    });

    test('Mayon, VTS safe → no section and no warning', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(MAYON, { volcanic_tsunami: 'Safe' }));
        assert.ok(!headings(out).includes('Volcanic Tsunami'));
        assert.equal(out.warnings.length, 0);
    });

    test('Pinatubo, VTS prone → skipped as before, no warning', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(PINATUBO, { volcanic_tsunami: 'Prone' }));
        assert.ok(!headings(out).includes('Volcanic Tsunami'));
        assert.equal(out.warnings.length, 0);
    });

    const at = (assessment, municipality, province) => {
        assessment.site_location = { barangay: 'Poblacion', municipality, province };
        return assessment;
    };

    test('Taal-area municipality → Fissure section with the reporting note, no warning', () => {
        const out = engine.processAssessment(at(makeVolcanoAssessment(TAAL, { fissure: FISSURE }), 'Talisay', 'Batangas'));
        const fissure = out.sections.find(s => s.heading === 'Fissure');
        assert.ok(fissure);
        assert.deepEqual(fissure.notes, [HAZARD_RULES_SCHEMA.volcano_rules.fissure.special_cases.taal.reporting]);
        assert.match(fissure.explanation_recommendation.recommendation, /^Fissures may develop further.*Zone of Avoidance\.$/);
        assert.equal(out.warnings.length, 0);
    });

    test('"City of Tanauan" and "Tanauan City" both match TANAUAN', () => {
        for (const m of ['City of Tanauan', 'Tanauan City']) {
            const out = engine.processAssessment(at(makeVolcanoAssessment(TAAL, { fissure: FISSURE }), m, 'Batangas'));
            assert.ok(headings(out).includes('Fissure'), m);
        }
    });

    test('Talisay outside Batangas → left out with a warning', () => {
        const out = engine.processAssessment(at(makeVolcanoAssessment(TAAL, { fissure: FISSURE }), 'Talisay City', 'Cebu'));
        assert.ok(!headings(out).includes('Fissure'));
        assert.match(out.warnings[0], /only for sites in AGONCILLO.*this site is in Talisay City, Cebu/);
    });

    test('Taal, unknown municipality → included with a check-before-issuing warning', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(TAAL, { fissure: FISSURE }));
        assert.ok(headings(out).includes('Fissure'));
        assert.equal(out.warnings.length, 1);
        assert.match(out.warnings[0], /municipality couldn't be read/);
    });

    test('Mayon, unknown municipality → section left out with a warning', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(MAYON, { fissure: FISSURE }));
        assert.ok(!headings(out).includes('Fissure'));
        assert.equal(out.warnings.length, 1);
        assert.match(out.warnings[0], /fissure\.applies_to/);
    });

    test('earthquake output always has an empty warnings array', () => {
        assert.deepEqual(engine.processAssessment(makeEqAssessment()).warnings, []);
    });
});

// ─── Earthquake: fissure distance read from the status text ───────────────────

describe('Earthquake — fissure distance from status text', () => {
    const hasFissure = out => out.sections.some(s => s.heading === 'Fissure (Earthquake-Related)');
    const run = (fissure, extra = {}) => engine.processAssessment(makeEqAssessment({ fissure, ...extra }));

    test('"Approximately 1500 meters" → suppressed (beyond 1 km)', () => {
        assert.ok(!hasFissure(run('Safe; Approximately 1500 meters east of a mapped fissure')));
    });

    test('"Approximately 800 meters" → rendered', () => {
        assert.ok(hasFissure(run('Safe; Approximately 800 meters east of a mapped fissure')));
    });

    test('"Approximately 1,200 meters" (thousands separator) → suppressed', () => {
        assert.ok(!hasFissure(run('Safe; Approximately 1,200 meters east of a mapped fissure')));
    });

    test('"Approximately 1.2 kilometers" → suppressed', () => {
        assert.ok(!hasFissure(run('Safe; Approximately 1.2 kilometers east of a mapped fissure')));
    });

    test('buffer-zone "meter/s (or less)" wording → rendered', () => {
        assert.ok(hasFissure(run('Prone; Within the buffer zone; Approximately 3 meter/s (or less) east of a mapped fissure')));
    });

    test('transected (no distance in text) → rendered', () => {
        assert.ok(hasFissure(run('Prone; Transected by a mapped fissure at the northern portion of the property')));
    });

    test('explicit fissure_distance_m wins over the text', () => {
        assert.ok(!hasFissure(run('Safe; Approximately 800 meters east of a mapped fissure', { fissure_distance_m: 1500 })));
    });
});

// ─── table-row.js: assessment table → Assessment ──────────────────────────────

describe('table-row — assessmentFromRow / findCategoryRow', () => {
    function row(values) {
        const parts = Array(17).fill('');
        for (const [field, value] of Object.entries(values)) parts[COLUMNS[field]] = value;
        return parts;
    }

    const eqRow = row({
        id: '7', category: 'Earthquake', coordinates: '121.0, 14.5',
        active_fault: 'Safe; Approximately 2 kilometers north of the West Valley Fault', fissure: ' Prone ',
    });
    const volRow = row({
        id: '8', category: 'Volcano',
        nearest_active_volcano: 'Approximately 30 kilometers North of Mayon Volcano', lahar: 'Prone',
    });
    const volcanoOut = options => engine.processAssessment(
        assessmentFromRow(volRow, { category: AssessmentCategory.VOLCANO, ...options })
    );

    test('findCategoryRow picks the matching row, else the first', () => {
        assert.equal(findCategoryRow([eqRow, volRow], 'Volcano'), volRow);
        assert.equal(findCategoryRow([eqRow], 'Volcano'), eqRow);
    });

    test('earthquake row → cells mapped and trimmed, blanks become "--"', () => {
        const a = assessmentFromRow(eqRow, { category: AssessmentCategory.EARTHQUAKE });
        assert.equal(a.id, '7');
        assert.equal(a.earthquake.fissure, 'Prone');
        assert.equal(a.earthquake.tsunami, '--');
        assert.equal(a.volcano, null);
        assert.equal(a.location.longitude, 121.0);
        assert.equal(a.location.latitude, 14.5);
    });

    test('volcano row → outside_watershed and is_island_volcano come from the options', () => {
        const a = assessmentFromRow(volRow, {
            category: AssessmentCategory.VOLCANO, outsideWatershed: true, isIslandVolcano: true,
        });
        assert.equal(a.volcano.outside_watershed, true);
        assert.equal(a.volcano.is_island_volcano, true);
        assert.equal(a.earthquake, null);
    });

    test('outsideWatershed option reaches the gatekeeper end to end', () => {
        const out = volcanoOut({ outsideWatershed: true });
        assert.ok(out.common_statements.some(s => s.explanation.includes('safe from volcanic hazards')));
        assert.equal(out.sections.length, 0);
    });

    test('isIslandVolcano option selects the island text end to end', () => {
        const out = volcanoOut({ outsideWatershed: true, isIslandVolcano: true });
        assert.ok(out.common_statements.some(s => s.explanation.includes('safe from erupted products')));
    });

    test('options default to off: Mayon at 30 km gets hazard sections', () => {
        assert.ok(volcanoOut({}).sections.some(s => s.heading === 'Lahar'));
    });

    test('map options reach the volcano model, with defaults AV map yes, PAV map no', () => {
        const d = assessmentFromRow(volRow, { category: AssessmentCategory.VOLCANO });
        assert.equal(d.volcano.av_has_hazard_map, true);
        assert.equal(d.volcano.pav_has_hazard_map, false);
        const a = assessmentFromRow(volRow, { category: AssessmentCategory.VOLCANO, avHasHazardMap: false, pavHasHazardMap: true });
        assert.equal(a.volcano.av_has_hazard_map, false);
        assert.equal(a.volcano.pav_has_hazard_map, true);
    });

    test('siteLocation is parsed as "Barangay, City, Province"', () => {
        const a = assessmentFromRow(volRow, { category: AssessmentCategory.VOLCANO, siteLocation: 'Poblacion, Talisay, Batangas' });
        assert.deepEqual(a.site_location, { barangay: 'Poblacion', municipality: 'Talisay', province: 'Batangas' });
    });

    test('parseSiteLocation: fewer than three parts → null', () => {
        assert.equal(parseSiteLocation('Talisay, Batangas'), null);
        assert.equal(parseSiteLocation(''), null);
        assert.equal(parseSiteLocation(undefined), null);
    });
});
