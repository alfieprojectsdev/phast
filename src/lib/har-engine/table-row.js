// src/lib/har-engine/table-row.js
// Turns one row of the HAS Admin assessment table into an Assessment.
// Kept out of popup.js so the column mapping can be tested without a DOM.

import { Assessment, AssessmentCategory, Coordinate, FeatureType } from './models.js';

// Column positions in #assessment-grid table.items (td index per row).
export const COLUMNS = {
    id: 0,
    category: 1,
    coordinates: 3,
    active_fault: 4,
    liquefaction: 5,
    landslide: 6,
    tsunami: 7,
    nearest_active_volcano: 8,
    nearest_pav: 9,
    fissure: 10,
    lahar: 11,
    pyroclastic_flow: 12,
    base_surge: 13,
    lava_flow: 14,
    ballistic_projectile: 15,
    volcanic_tsunami: 16,
};

const EARTHQUAKE_FIELDS = ['active_fault', 'liquefaction', 'landslide', 'tsunami', 'fissure'];
const VOLCANO_FIELDS = [
    'nearest_active_volcano', 'nearest_pav', 'fissure', 'lahar', 'pyroclastic_flow',
    'base_surge', 'lava_flow', 'ballistic_projectile', 'volcanic_tsunami',
];

const cell = (parts, field) => (parts[COLUMNS[field]] ? parts[COLUMNS[field]].trim() : "--");

/**
 * The row whose category cell matches, or the first row if none does.
 * @param {string[][]} rows
 * @param {string} category  AssessmentCategory value
 */
export function findCategoryRow(rows, category) {
    return rows.find(parts =>
        parts[COLUMNS.category] && parts[COLUMNS.category].trim().toLowerCase() === category.toLowerCase()
    ) || rows[0];
}

/**
 * @param {string[]} parts  Cell texts of one table row
 * @param {object} options
 * @param {string} options.category              AssessmentCategory value
 * @param {boolean} [options.vicinityMapProvided]
 * @param {boolean} [options.outsideWatershed]    Volcano only
 * @param {boolean} [options.isIslandVolcano]     Volcano only
 * @returns {Assessment}
 */
export function assessmentFromRow(parts, { category, vicinityMapProvided = false, outsideWatershed = false, isIslandVolcano = false }) {
    const pick = fields => Object.fromEntries(fields.map(f => [f, cell(parts, f)]));
    const isEarthquake = category === AssessmentCategory.EARTHQUAKE;

    return new Assessment({
        id: parts[COLUMNS.id] || "1",
        category: category,
        feature_type: FeatureType.POINT,
        location: Coordinate.fromString(parts[COLUMNS.coordinates] ? parts[COLUMNS.coordinates].trim() : "0,0"),
        vicinity_map_provided: vicinityMapProvided,
        earthquake: isEarthquake ? pick(EARTHQUAKE_FIELDS) : null,
        volcano: isEarthquake ? null : {
            ...pick(VOLCANO_FIELDS),
            outside_watershed: outsideWatershed,
            is_island_volcano: isIslandVolcano,
        },
    });
}
