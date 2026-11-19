// src/lib/fault-lgus.js
// Lists the municipalities a fault line traverses, in the form the HAR
// template wants for unnamed faults:
//   "...of an unnamed fault traversing Mauban, Sampaloc, Tayabas and Pagbilao, Quezon"
// (HAR Templates June 2024; OHAS 2025 slide 51). HAS Admin's own assessment
// only says "...of the Unnamed Fault", so assessors look the places up by hand.
//
// Kept free of browser APIs so it can be tested in Node. The caller supplies
// the fault line (from the ActiveFault service) and the municipal boundaries.

const EARTH_RADIUS_M = 6371008.8;
const rad = d => d * Math.PI / 180;

/** Great-circle distance in metres between two [lon, lat] points. */
export function distanceM([lon1, lat1], [lon2, lat2]) {
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
        Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Ray casting on one ring of [lon, lat] points.
function inRing([x, y], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/**
 * True when the point is inside a GeoJSON Polygon or MultiPolygon geometry
 * (holes respected).
 */
export function inGeometry(point, geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.some(([outer, ...holes]) => inRing(point, outer) && !holes.some(h => inRing(point, h)));
}

function bboxOf(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const poly of polygons) for (const [x, y] of poly[0]) {
        if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
    }
    return [w, s, e, n];
}

/**
 * Prepares municipalities once, so repeated lookups skip the bounding-box work.
 * @param {{name: string, province: string, geometry: object}[]} municipalities
 */
export function indexMunicipalities(municipalities) {
    return municipalities.map(m => ({ ...m, bbox: bboxOf(m.geometry) }));
}

// The template lists places north to south or west to east (OHAS 2025
// slide 106), so walk the line from its northern end when it runs mostly
// north-south, and from its western end otherwise.
function orient(line) {
    const first = line[0], last = line[line.length - 1];
    const ns = distanceM(first, [first[0], last[1]]);
    const ew = distanceM(first, [last[0], first[1]]);
    const startsWrongEnd = ns >= ew ? first[1] < last[1] : first[0] > last[0];
    return startsWrongEnd ? [...line].reverse() : line;
}

/**
 * Walks the fault line in steps of about `stepM` metres and records which
 * municipality each step falls in.
 *
 * @param {number[][]} line  Fault line as [lon, lat] points
 * @param {object[]} index   From indexMunicipalities()
 * @param {object} [options]
 * @param {number} [options.stepM=50]
 * @returns {{name: string, province: string, metres: number}[]} in template order;
 *   steps outside every municipality (sea, gaps) are dropped
 */
export function municipalitiesAlong(line, index, { stepM = 50 } = {}) {
    const walked = orient(line);
    const out = [];
    let last = null;
    const record = (point, metres) => {
        const hit = index.find(m => {
            const [w, s, e, n] = m.bbox;
            return point[0] >= w && point[0] <= e && point[1] >= s && point[1] <= n && inGeometry(point, m.geometry);
        });
        if (!hit) { last = null; return; }
        if (last && last.name === hit.name && last.province === hit.province) { last.metres += metres; return; }
        // A line can leave a municipality and come back; list it once, where it first appears.
        const seen = out.find(o => o.name === hit.name && o.province === hit.province);
        if (seen) { seen.metres += metres; last = seen; return; }
        last = { name: hit.name, province: hit.province, metres };
        out.push(last);
    };
    for (let i = 0; i < walked.length - 1; i++) {
        const a = walked[i], b = walked[i + 1];
        const steps = Math.max(1, Math.ceil(distanceM(a, b) / stepM));
        const each = distanceM(a, b) / steps;
        for (let k = 0; k < steps; k++) {
            const t = (k + 0.5) / steps;
            record([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], each);
        }
    }
    return out;
}

const UNNAMED_FAULT = /\bthe unnamed fault\b/i;

/** True when an active fault status refers to HAS Admin's "the Unnamed Fault". */
export function mentionsUnnamedFault(status) {
    return UNNAMED_FAULT.test(status || '');
}

/**
 * Rewrites HAS Admin's wording into the template's:
 *   "Safe; Approximately 10 kilometers west of the Unnamed Fault"
 *   -> "Safe; Approximately 10 kilometers west of an unnamed fault traversing Laur, Palayan City and General Tinio, Nueva Ecija"
 * Returns null when the status doesn't name the Unnamed Fault.
 */
export function unnamedFaultStatus(status, traversed) {
    if (!mentionsUnnamedFault(status) || !traversed) return null;
    return status.replace(UNNAMED_FAULT, `an unnamed fault traversing ${traversed}`);
}

/** "City of Antipolo" -> "Antipolo City", as the template writes it. */
export function templateName(name) {
    const m = /^City of (.+)$/i.exec(name.trim());
    return m ? `${m[1]} City` : name.trim();
}

const joinAnd = names => names.length < 2 ? names.join('') :
    `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * Formats the list the way the template's examples do: municipalities joined
 * with commas and "and", then the province.
 *   "Mauban, Sampaloc, Tayabas and Pagbilao, Quezon"
 * The templates only show single-province examples, so a fault crossing
 * provinces returns null and the assessor writes that list by hand.
 *
 * @param {{name: string, province: string}[]} places  From municipalitiesAlong()
 * @returns {string|null}
 */
export function formatTraversed(places) {
    const provinces = new Set(places.map(p => p.province));
    if (provinces.size !== 1) return null;
    return `${joinAnd(places.map(p => templateName(p.name)))}, ${places[0].province}`;
}
