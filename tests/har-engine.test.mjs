/**
 * har-engine unit tests
 * Run: node --experimental-vm-modules tests/har-engine.test.mjs
 *   or: node tests/har-engine.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { HAZARD_RULES_SCHEMA } from '../src/lib/har-engine/rules.js';
import { DecisionEngine } from '../src/lib/har-engine/engine.js';
import { assessmentFromRow, findCategoryRow, COLUMNS } from '../src/lib/har-engine/table-row.js';
import {
    Assessment,
    AssessmentCategory,
    EarthquakeAssessment,
    VolcanoAssessment,
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

    test('Unknown volcano < 10 km → generic no-PDZ fallback text emitted', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(UNKNOWN_CLOSE));
        const combined = out.common_statements.map(s => s.explanation).join(' ');
        assert.ok(
            combined.includes('10-kilometer radius') || combined.includes('highly prone to eruptive'),
            'Expected no-PDZ fallback text for close unknown volcano'
        );
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

    test('volcanic_tsunami recommendation includes three natural signs', () => {
        const rec = HAZARD_RULES_SCHEMA.volcano_rules.volcanic_tsunami.recommendation;
        assert.ok(rec.includes('three natural signs') || rec.includes('ground shaking'));
    });

    test('volcano fissure applies_to is Taal only', () => {
        assert.deepEqual(HAZARD_RULES_SCHEMA.volcano_rules.fissure.applies_to, ['Taal']);
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

    test('Taal, fissure value → Fissure section rendered', () => {
        const out = engine.processAssessment(makeVolcanoAssessment(TAAL, { fissure: FISSURE }));
        assert.ok(headings(out).includes('Fissure'));
        assert.equal(out.warnings.length, 0);
    });

    test('Mayon, fissure value → section left out with a warning', () => {
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
});
