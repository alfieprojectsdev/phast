/**
 * Matching report statements to HAS Admin's recommendation library
 * (src/lib/recommendations.js).
 * Run: node --test tests/recommendations.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { reportStatements, planSelection, volcanoName } from '../src/lib/recommendations.js';

const row = (id, category, volcano, text) => ({ id, category, volcano, text });

const LIBRARY = [
    row('3', 'Earthquake', 'N/A', 'All hazard assessments are based on the latest available hazard maps and on the location indicated by the coordinates provided.'),
    row('8', 'Earthquake', 'N/A', 'All sites may be affected by ground shaking.'),
    row('10', 'Earthquake', 'N/A', 'Ground shaking and liquefaction hazards can be mitigated by following the provisions of the National Building Code and the Structural Code of the Philippines.'),
    row('90', 'Earthquake', 'N/A', 'This hazard assessment supersedes any previous assessment made by this office regarding the site.'),
    row('98', 'Volcano', 'Taal', 'This hazard assessment supersedes any previous assessment made by this office regarding the site.'),
    row('105', 'Volcano', 'Taal', 'Fissures may develop further. For land-use planning, at least 5 meters on both sides may be considered as a Zone of Avoidance.'),
    row('120', 'Volcano', 'N/A', 'Zone 1 includes areas at high susceptibility.'),
    row('121', 'Volcano', 'Pinatubo', 'The lahar hazards assessment for Pinatubo Volcano is a long-term projection.'),
];

const st = (text, where = 'Section') => ({ text, where });

describe('planSelection', () => {
    test('ticks exact matches from the report category only', () => {
        const plan = planSelection([st('All sites may be affected by ground shaking.')], LIBRARY, [], { category: 'Earthquake' });
        assert.deepEqual(plan.toTick.map(t => t.id), ['8']);
    });

    test('skips statements the assessment already has', () => {
        const selected = [{ text: 'All hazard assessments are based on the latest available hazard maps and on the location indicated by the coordinates provided.' }];
        const plan = planSelection([st(selected[0].text, 'Intro')], LIBRARY, selected, { category: 'Earthquake' });
        assert.equal(plan.toTick.length, 0);
        assert.equal(plan.present.length, 1);
    });

    test('a statement inside a combined selected row counts as present', () => {
        const selected = [{ text: 'Ground rupture hazard assessment is the distance to the nearest known active fault. The recommended buffer zone is at least 5 meters.' }];
        const plan = planSelection([st('Ground rupture hazard assessment is the distance to the nearest known active fault.')], LIBRARY, selected, { category: 'Earthquake' });
        assert.equal(plan.present.length, 1);
    });

    test('picks the earthquake supersedes row, not the identical Taal one', () => {
        const text = 'This hazard assessment supersedes any previous assessment made by this office regarding the site.';
        assert.deepEqual(planSelection([st(text)], LIBRARY, [], { category: 'Earthquake' }).toTick.map(t => t.id), ['90']);
        assert.deepEqual(planSelection([st(text)], LIBRARY, [], { category: 'Volcano', volcano: 'Taal' }).toTick.map(t => t.id), ['98']);
    });

    test("ignores another volcano's rows", () => {
        const plan = planSelection([st('The lahar hazards assessment for Pinatubo Volcano is a long-term projection.')], LIBRARY, [], { category: 'Volcano', volcano: 'Mayon' });
        assert.equal(plan.toTick.length, 0);
    });

    test('a statement inside a combined library row ticks that row once', () => {
        const plan = planSelection(
            [st('Fissures may develop further.'), st('For land-use planning, at least 5 meters on both sides may be considered as a Zone of Avoidance.')],
            LIBRARY, [], { category: 'Volcano', volcano: 'Taal' });
        assert.deepEqual(plan.toTick.map(t => t.id), ['105']);
    });

    test('a report statement spanning several library rows ticks each', () => {
        const plan = planSelection([st('The lahar hazards assessment for Pinatubo Volcano is a long-term projection. Zone 1 includes areas at high susceptibility.')],
            LIBRARY, [], { category: 'Volcano', volcano: 'Pinatubo' });
        assert.deepEqual(plan.toTick.map(t => t.id).sort(), ['120', '121']);
    });

    test('near wording is reported, never ticked', () => {
        const plan = planSelection([st('All sites may be affected by strong ground shaking.')], LIBRARY, [], { category: 'Earthquake' });
        assert.equal(plan.toTick.length, 0);
        assert.equal(plan.near[0].id, '8');
    });

    test('wording with no close row is missing', () => {
        const plan = planSelection([st('Furthermore, the site is within the Taal fracture zone.')], LIBRARY, [], { category: 'Volcano', volcano: 'Taal' });
        assert.equal(plan.missing.length, 1);
    });

    test('lists selected statements the report does not use', () => {
        const selected = [{ text: 'Ground shaking hazard can be mitigated by following the provisions of the National Building Code.' }];
        const plan = planSelection([st('All sites may be affected by ground shaking.')], LIBRARY, selected, { category: 'Earthquake' });
        assert.deepEqual(plan.extra, selected);
    });
});

describe('reportStatements', () => {
    test('lists intro, section text, notes, common statements and supersedes in order, without boilerplate', () => {
        const har = {
            intro: 'Intro text.',
            sections: [{ heading: 'Fissure', explanation_recommendation: { explanation: 'Expl.', recommendation: 'Rec.' }, notes: ['Note.'] }],
            common_statements: [{ explanation: 'Common expl.', recommendation: '' }],
            supersedes: 'Supersedes text.',
            boilerplate: { qr: 'QR text.' },
        };
        assert.deepEqual(reportStatements(har).map(s => s.text), ['Intro text.', 'Expl.', 'Rec.', 'Note.', 'Common expl.', 'Supersedes text.']);
    });

    test('drops repeats', () => {
        const har = { intro: 'Same.', sections: [], common_statements: [{ recommendation: 'Same.' }], supersedes: '' };
        assert.equal(reportStatements(har).length, 1);
    });
});

describe('volcanoName', () => {
    test('reads the volcano from the nearest-volcano cell', () => {
        assert.equal(volcanoName('Approximately 12.3 km northeast of Taal Volcano'), 'Taal');
        assert.equal(volcanoName('Approximately 40 kilometers south of Mayon Volcano'), 'Mayon');
        assert.equal(volcanoName('--'), '');
    });
});
