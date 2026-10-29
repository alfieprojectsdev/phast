// src/lib/eil-handoff.js
// Builds the link "Send to EIL-Viz" opens. Kept out of popup.js so the
// encoding can be tested without a browser.

/**
 * Link that opens EIL-Viz with a parcel.
 *
 * The parcel goes in the fragment (`#geo=`), which browsers never send to the
 * server, so it stays out of web server and proxy access logs. It's base64 of
 * the GeoJSON's UTF-8 bytes, percent-encoded: EIL-Viz reads the fragment with
 * URLSearchParams, which would otherwise turn base64's '+' into a space.
 *
 * @param {string} base     EIL server origin, without a trailing slash
 * @param {string} geoJson  GeoJSON text (the drawn FeatureCollection)
 * @returns {string}
 */
export function eilVizUrl(base, geoJson) {
    let binary = '';
    for (const byte of new TextEncoder().encode(geoJson)) binary += String.fromCharCode(byte);
    return `${base}/#geo=${encodeURIComponent(btoa(binary))}`;
}
