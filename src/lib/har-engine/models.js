// src/lib/har-engine/models.js

export class AssessmentCategory {
    static EARTHQUAKE = "Earthquake";
    static VOLCANO = "Volcano";
}

export class FeatureType {
    static POLYGON = "Polygon";
    static POINT = "Point";
    static LINE = "Line";
}

export class Coordinate {
    constructor(longitude, latitude) {
        this.longitude = longitude;
        this.latitude = latitude;
    }

    static fromString(coordStr) {
        if (!coordStr || typeof coordStr !== 'string') {
            return new Coordinate(0, 0);
        }
        const parts = coordStr.split(',').map(s => parseFloat(s.trim()));
        const lon = isNaN(parts[0]) ? 0 : parts[0];
        const lat = isNaN(parts[1]) ? 0 : parts[1];
        return new Coordinate(lon, lat);
    }

    toString() {
        return `${this.longitude},${this.latitude}`;
    }
}

export class EarthquakeAssessment {
    constructor({ active_fault, liquefaction, landslide, tsunami, fissure, fissure_distance_m } = {}) {
        this.active_fault = active_fault || null;
        this.liquefaction = liquefaction || null;
        this.landslide = landslide || null;
        this.tsunami = tsunami || null;
        this.fissure = fissure || null;
        // Distance in metres to the nearest mapped fissure. Required to enforce the
        // "only assess if within 1 km" trigger. Null means unknown (trigger not enforced).
        this.fissure_distance_m = fissure_distance_m ?? null;
    }

    isAssessed(hazard) {
        const value = this[hazard];
        return value !== null && value !== undefined && value !== "--" && value !== "";
    }

    isSafe(hazard) {
        if (!this.isAssessed(hazard)) return true;
        const value = this[hazard];
        return typeof value === 'string' && value.toLowerCase().includes("safe");
    }
}

export class VolcanoAssessment {
    constructor({ nearest_active_volcano, nearest_pav, fissure, lahar, pyroclastic_flow, base_surge, lava_flow, ballistic_projectile, volcanic_tsunami, outside_watershed, is_island_volcano } = {}) {
        this.nearest_active_volcano = nearest_active_volcano || null;
        this.nearest_pav = nearest_pav || null;
        this.fissure = fissure || null;
        this.lahar = lahar || null;
        this.pyroclastic_flow = pyroclastic_flow || null;
        this.base_surge = base_surge || null;
        this.lava_flow = lava_flow || null;
        this.ballistic_projectile = ballistic_projectile || null;
        this.volcanic_tsunami = volcanic_tsunami || null;
        // True when the site is outside the volcano's watershed even if < 50 km.
        // Activates the "outside_safe_zone" gatekeeper without the distance check.
        this.outside_watershed = outside_watershed ?? false;
        // True for volcanoes whose hazard footprint is primarily the island itself
        // (e.g. Biliran, Hibok-Hibok). Selects the island-specific distant text.
        this.is_island_volcano = is_island_volcano ?? false;
    }

    isAssessed(hazard) {
        const value = this[hazard];
        return value !== null && value !== undefined && value !== "--" && value !== "";
    }

    isSafe(hazard) {
        if (!this.isAssessed(hazard)) return true;
        const value = this[hazard];
        return typeof value === 'string' && value.toLowerCase().includes("safe");
    }
}

export class Assessment {
    constructor({ id, category, feature_type, location, earthquake, volcano, vicinity_map_provided = false } = {}) {
        this.id = id;
        this.category = category;
        this.feature_type = feature_type;
        this.location = location; // Coordinate object or similar
        this.earthquake = earthquake ? new EarthquakeAssessment(earthquake) : null;
        this.volcano = volcano ? new VolcanoAssessment(volcano) : null;
        this.vicinity_map_provided = vicinity_map_provided;
    }

    hasEarthquakeAssessment() {
        return this.earthquake !== null;
    }

    hasVolcanoAssessment() {
        return this.volcano !== null;
    }
}

export class HARSection {
    constructor(heading, assessment, explanationRecommendation, order = 99) {
        this.heading = heading;
        this.assessment = assessment;
        this.explanation_recommendation = explanationRecommendation;
        this.order = order;
    }
}

export class ExplanationRecommendation {
    constructor(explanation, recommendation) {
        this.explanation = explanation || "";
        this.recommendation = recommendation || "";
    }

    static fromParts({ explanation, recommendation } = {}) {
        return new ExplanationRecommendation(explanation, recommendation);
    }
}

export class HAROutput {
    constructor({ category, intro, sections, common_statements, supersedes, additional_recommendations, boilerplate }) {
        this.category = category;
        this.intro = intro;
        this.sections = sections || [];
        this.common_statements = common_statements || [];
        this.supersedes = supersedes;
        this.additional_recommendations = additional_recommendations || [];
        this.boilerplate = boilerplate || {};
    }
}
