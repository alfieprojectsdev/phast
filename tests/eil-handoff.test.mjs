/**
 * EIL-Viz handoff link (src/lib/eil-handoff.js).
 * Run: node --test tests/eil-handoff.test.mjs
 *
 * The round-trip cases decode the link the way EIL-Viz does: URLSearchParams
 * over the fragment, then atob and TextDecoder.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eilVizUrl } from '../src/lib/eil-handoff.js';

const BASE = 'http://eil.example.test';

function parcel(properties) {
    return JSON.stringify({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties,
            geometry: { type: 'Polygon', coordinates: [[[121, 14], [121.001, 14], [121.001, 14.001], [121, 14]]] },
        }],
    });
}

function decodeAsEilViz(url) {
    const hash = new URL(url).hash.slice(1);
    const b64 = new URLSearchParams(hash).get('geo');
    return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
}

describe('eilVizUrl', () => {
    test('puts the parcel in the fragment, not the query string', () => {
        const url = new URL(eilVizUrl(BASE, parcel({ name: 'Lot 1' })));
        assert.equal(url.origin + url.pathname, `${BASE}/`);
        assert.equal(url.search, '');
        assert.ok(url.hash.startsWith('#geo='));
    });

    test("survives base64 '+' (HTML in a KML description)", () => {
        const geo = parcel({ description: '<b>desc</b>?' });
        // Guard the premise: this parcel's base64 really contains '+'.
        assert.ok(Buffer.from(geo, 'utf8').toString('base64').includes('+'));
        assert.equal(decodeAsEilViz(eilVizUrl(BASE, geo)), geo);
    });

    test('survives non-ASCII names', () => {
        const geo = parcel({ name: 'Brgy. Santo Niño', description: 'Lot >5, a~b' });
        assert.equal(decodeAsEilViz(eilVizUrl(BASE, geo)), geo);
    });

    test('the encoded value has no raw base64 punctuation', () => {
        const value = eilVizUrl(BASE, parcel({ description: '<b>desc</b>?' })).split('#geo=')[1];
        assert.doesNotMatch(value, /[+/=]/);
    });
});
