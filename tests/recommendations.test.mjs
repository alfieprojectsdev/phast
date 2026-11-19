/**
 * Matching report statements to HAS Admin's recommendation library
 * (src/lib/recommendations.js).
 * Run: node --test tests/recommendations.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { reportStatements, planSelection, suggestOrder } from '../src/lib/recommendations.js';

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

describe('suggestOrder', () => {
    const statements = ['Intro.', 'Ground rupture explanation.', 'Ground rupture recommendation.', 'All sites may be affected by strong ground shaking.', 'Supersedes.'].map(text => ({ text }));

    test('numbers the statements in report order, from 0', () => {
        const selected = [
            { text: 'Supersedes.', order: '0' },
            { text: 'Intro.', order: '1' },
            { text: 'All sites may be affected by strong ground shaking.', order: '2' },
        ];
        assert.deepEqual(suggestOrder(statements, selected).map(r => [r.text, r.current, r.suggested]), [
            ['Intro.', 1, 0],
            ['All sites may be affected by strong ground shaking.', 2, 1],
            ['Supersedes.', 0, 2],
        ]);
    });

    test('a combined row takes the place of its first statement', () => {
        const selected = [
            { text: 'Supersedes.', order: '1' },
            { text: 'Ground rupture explanation. Ground rupture recommendation.', order: '0' },
        ];
        assert.deepEqual(suggestOrder(statements, selected).map(r => r.suggested), [0, 1]);
        assert.equal(suggestOrder(statements, selected)[0].text, 'Ground rupture explanation. Ground rupture recommendation.');
    });

    test('statements the report does not use go last, unnumbered', () => {
        const selected = [{ text: 'Something else entirely.', order: '0' }, { text: 'Intro.', order: '1' }];
        assert.deepEqual(suggestOrder(statements, selected).map(r => [r.text, r.suggested]), [['Intro.', 0], ['Something else entirely.', null]]);
    });

    test('a missing order reads as null', () => {
        assert.equal(suggestOrder(statements, [{ text: 'Intro.' }])[0].current, null);
    });
});

describe('{{AV}} and {{PAV}} placeholders', () => {
    const PAV_ROW = row('180', 'Volcano', 'N/A', '{{PAV}} Volcano is currently classified by DOST-PHIVOLCS as a potentially active volcano.');
    const AV_ROW = row('181', 'Volcano', 'N/A', 'The site is outside the Permanent Danger Zone of {{AV}} Volcano.');
    const report = [
        st('Arayat Volcano is currently classified by DOST-PHIVOLCS as a potentially active volcano.'),
        st('The site is outside the Permanent Danger Zone of Pinatubo Volcano.'),
    ];

    test('a library row with a placeholder matches the report statement with the name filled in', () => {
        const plan = planSelection(report, [PAV_ROW, AV_ROW], [], { category: 'Volcano', volcano: 'Pinatubo', pav: 'Arayat' });
        assert.deepEqual(plan.toTick.map(t => t.id).sort(), ['180', '181']);
    });

    test('a selected row with a placeholder counts as present', () => {
        const plan = planSelection(report.slice(0, 1), [PAV_ROW], [{ text: PAV_ROW.text }], { category: 'Volcano', volcano: 'Pinatubo', pav: 'Arayat' });
        assert.equal(plan.present.length, 1);
        assert.equal(plan.extra.length, 0);
    });

    test('without the PAV name it is not ticked', () => {
        const plan = planSelection(report.slice(0, 1), [PAV_ROW], [], { category: 'Volcano', volcano: 'Pinatubo' });
        assert.equal(plan.toTick.length, 0);
    });

    test('a {{PAV}} row on an earthquake assessment is listed as not in the report', () => {
        const eq = [st('All sites may be affected by strong ground shaking.')];
        const plan = planSelection(eq, LIBRARY, [{ text: PAV_ROW.text }], { category: 'Earthquake' });
        assert.deepEqual(plan.extra.map(e => e.text), [PAV_ROW.text]);
    });

    test('suggestOrder places a placeholder row where its statement is', () => {
        const order = suggestOrder(report, [{ text: AV_ROW.text, order: '0' }, { text: PAV_ROW.text, order: '1' }], { volcano: 'Pinatubo', pav: 'Arayat' });
        assert.deepEqual(order.map(r => [r.text, r.suggested]), [[PAV_ROW.text, 0], [AV_ROW.text, 1]]);
    });
});
