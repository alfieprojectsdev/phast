/**
 * Municipalities along a fault line (src/lib/fault-lgus.js).
 * Run: node --test tests/fault-lgus.test.mjs
 *
 * Synthetic squares only; no real boundary or fault data in the repo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { indexMunicipalities, municipalitiesAlong, formatTraversed, templateName, inGeometry, mentionsUnnamedFault, unnamedFaultStatus } from '../src/lib/fault-lgus.js';

// A 0.1-degree square with its south-west corner at (x, y).
const square = (x, y, size = 0.1) => ({
    type: 'Polygon',
    coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
});

// Three municipalities stacked north to south in one province, and a fourth
// to the south in another.
const MUNIS = indexMunicipalities([
    { name: 'Northtown', province: 'Alpha', geometry: square(121.0, 14.2) },
    { name: 'City of Midville', province: 'Alpha', geometry: square(121.0, 14.1) },
    { name: 'Southburg', province: 'Alpha', geometry: square(121.0, 14.0) },
    { name: 'Farside', province: 'Beta', geometry: square(121.0, 13.9) },
]);

describe('municipalitiesAlong', () => {
    test('a north-south line lists municipalities north to south', () => {
        const line = [[121.05, 14.28], [121.05, 14.02]];
        assert.deepEqual(municipalitiesAlong(line, MUNIS).map(p => p.name), ['Northtown', 'City of Midville', 'Southburg']);
    });

    test('the same line drawn south to north gives the same order', () => {
        const line = [[121.05, 14.02], [121.05, 14.28]];
        assert.deepEqual(municipalitiesAlong(line, MUNIS).map(p => p.name), ['Northtown', 'City of Midville', 'Southburg']);
    });

    test('an east-west line lists municipalities west to east', () => {
        const ew = indexMunicipalities([
            { name: 'West', province: 'P', geometry: square(121.0, 14.0) },
            { name: 'East', province: 'P', geometry: square(121.1, 14.0) },
        ]);
        assert.deepEqual(municipalitiesAlong([[121.18, 14.05], [121.02, 14.05]], ew).map(p => p.name), ['West', 'East']);
    });

    test('reports roughly how much of the line lies in each municipality', () => {
        const [north] = municipalitiesAlong([[121.05, 14.28], [121.05, 14.22]], MUNIS);
        assert.ok(Math.abs(north.metres - 6672) < 100, `got ${north.metres}`);
    });

    test('a municipality the line leaves and re-enters is listed once', () => {
        const line = [[121.05, 14.25], [121.05, 14.15], [121.05, 14.25]];
        assert.deepEqual(municipalitiesAlong(line, MUNIS).map(p => p.name), ['Northtown', 'City of Midville']);
    });

    test('points outside every municipality (sea) are skipped', () => {
        assert.deepEqual(municipalitiesAlong([[122.5, 14.5], [122.6, 14.5]], MUNIS), []);
    });
});

describe('inGeometry', () => {
    test('respects holes', () => {
        const withHole = { type: 'Polygon', coordinates: [square(0, 0, 1).coordinates[0], square(0.4, 0.4, 0.2).coordinates[0]] };
        assert.equal(inGeometry([0.1, 0.1], withHole), true);
        assert.equal(inGeometry([0.5, 0.5], withHole), false);
    });

    test('handles MultiPolygons (island municipalities)', () => {
        const multi = { type: 'MultiPolygon', coordinates: [square(0, 0).coordinates, square(5, 5).coordinates] };
        assert.equal(inGeometry([5.05, 5.05], multi), true);
    });
});

describe('formatTraversed', () => {
    test('matches the template example shape: commas, "and", then the province', () => {
        const places = ['Mauban', 'Sampaloc', 'Tayabas', 'Pagbilao'].map(name => ({ name, province: 'Quezon' }));
        assert.equal(formatTraversed(places), 'Mauban, Sampaloc, Tayabas and Pagbilao, Quezon');
    });

    test('writes PSA city names the template way', () => {
        assert.equal(templateName('City of Antipolo'), 'Antipolo City');
        const places = [{ name: 'City of Antipolo', province: 'Rizal' }, { name: 'Baras', province: 'Rizal' }, { name: 'Tanay', province: 'Rizal' }];
        assert.equal(formatTraversed(places), 'Antipolo City, Baras and Tanay, Rizal');
    });

    test('one municipality', () => {
        assert.equal(formatTraversed([{ name: 'Gabaldon', province: 'Nueva Ecija' }]), 'Gabaldon, Nueva Ecija');
    });

    test('more than one province: no text, so the assessor writes it by hand', () => {
        const line = [[121.05, 14.15], [121.05, 13.95]];
        assert.equal(formatTraversed(municipalitiesAlong(line, MUNIS)), null);
    });

    test('no municipalities (line at sea): no text', () => {
        assert.equal(formatTraversed([]), null);
    });
});

describe('unnamedFaultStatus', () => {
    const PLACES = 'Laur, Palayan City and General Tinio, Nueva Ecija';

    test("rewrites HAS Admin's wording into the template's", () => {
        assert.equal(
            unnamedFaultStatus('Safe; Approximately 10 kilometers west of the Unnamed Fault', PLACES),
            `Safe; Approximately 10 kilometers west of an unnamed fault traversing ${PLACES}`);
    });

    test('works for a transected site too', () => {
        assert.equal(
            unnamedFaultStatus('Prone; Transected by the Unnamed Fault at the eastern portion of the property', 'Baras and Tanay, Rizal'),
            'Prone; Transected by an unnamed fault traversing Baras and Tanay, Rizal at the eastern portion of the property');
    });

    test('leaves named faults alone', () => {
        assert.equal(mentionsUnnamedFault('Safe; Approximately 2.1 kilometers north of the West Valley Fault'), false);
        assert.equal(unnamedFaultStatus('Safe; Approximately 2.1 kilometers north of the West Valley Fault', PLACES), null);
    });

    test('no place list → nothing to suggest', () => {
        assert.equal(unnamedFaultStatus('Safe; Approximately 10 kilometers west of the Unnamed Fault', null), null);
    });
});
