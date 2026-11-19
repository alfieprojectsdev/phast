// src/lib/recommendations.js
// Matches the statements in PHAST's generated report against HAS Admin's
// recommendation library (Assessment > speech-bubble icon), so PHAST can tick
// the library rows the assessment still needs. Kept free of browser APIs so it
// can be tested in Node.
//
// Only exact wording is ticked. HAS Admin's library predates parts of the 2025
// templates, so a near-identical row is reported for the assessor to judge,
// never ticked.

const NEAR_THRESHOLD = 0.6;

const norm = s => String(s || '').toLowerCase()
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();

const words = s => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean));

// Share of words two texts have in common (Jaccard index).
function similarity(a, b) {
    const A = words(a), B = words(b);
    let shared = 0;
    for (const w of A) if (B.has(w)) shared++;
    return shared / (A.size + B.size - shared || 1);
}

// HAS Admin's library and the assessment's statements write volcano names as
// {{AV}} (nearest active volcano) and {{PAV}} (nearest potentially active
// volcano), filled in when it renders the HAR; PHAST's report has the names
// themselves. To compare them, both sides write the report's volcano names,
// and the placeholders, as one token.
const VOLCANO_TOKEN = '{{volcano}}';
function canonical(names) {
    const keys = names.map(n => norm(n)).filter(Boolean).sort((a, b) => b.length - a.length);
    return text => {
        let t = norm(text).replace(/\{\{\s*p?av\s*\}\}/g, VOLCANO_TOKEN);
        for (const k of keys) t = t.split(k + ' volcano').join(VOLCANO_TOKEN + ' volcano');
        return t;
    };
}

const sentences = text => String(text).split(/(?<=\.)\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);

/**
 * The statements PHAST's report contains, in report order: the intro, each
 * section's explanation, recommendation and notes, the common statements and
 * the supersedes line. The boilerplate disclaimers are left out: they aren't
 * in HAS Admin's library and are printed on the HAR without being chosen.
 *
 * @param {object} har  HAROutput from the engine
 * @returns {{text: string, where: string}[]}
 */
export function reportStatements(har) {
    const out = [];
    const add = (text, where) => {
        const t = String(text || '').trim();
        if (t && !out.some(s => norm(s.text) === norm(t))) out.push({ text: t, where });
    };
    add(har.intro, 'Intro');
    for (const s of har.sections || []) {
        add(s.explanation_recommendation && s.explanation_recommendation.explanation, s.heading);
        add(s.explanation_recommendation && s.explanation_recommendation.recommendation, s.heading);
        for (const n of s.notes || []) add(n, s.heading);
    }
    for (const c of har.common_statements || []) {
        add(c.explanation, 'Common statements');
        add(c.recommendation, 'Common statements');
    }
    add(har.supersedes, 'Supersedes');
    return out;
}

/**
 * Works out which library rows to tick.
 *
 * @param {{text: string, where: string}[]} statements  From reportStatements()
 * @param {{id: string, category: string, volcano: string, text: string}[]} library
 *   Rows of the library grid
 * @param {{text: string}[]} selected  Statements already on the assessment
 * @param {{category: string, volcano?: string}} context
 *   The report's category ("Earthquake" or "Volcano") and, for volcano
 *   reports, the nearest volcano's name
 * @returns {{
 *   present: object[], toTick: {id: string, text: string, where: string}[],
 *   near: {statement: string, where: string, id: string, libraryText: string, score: number}[],
 *   missing: {statement: string, where: string}[], extra: {text: string}[]
 * }}
 */
export function planSelection(statements, library, selected, { category, volcano = '', pav = '' }) {
    const norm = canonical([volcano, pav]);
    const cat = norm(category);
    const volc = norm(volcano);
    const candidates = library.filter(r => norm(r.category) === cat &&
        (norm(r.volcano) === 'n/a' || !r.volcano || (volc && norm(r.volcano).includes(volc))));
    // A row for this volcano beats a generic one with the same text.
    const rank = r => (volc && norm(r.volcano).includes(volc)) ? 0 : 1;
    const pick = rows => rows.slice().sort((a, b) => rank(a) - rank(b))[0];

    const plan = { present: [], toTick: [], near: [], missing: [], extra: [] };
    const tick = (row, where) => { if (!plan.toTick.some(t => t.id === row.id)) plan.toTick.push({ id: row.id, text: row.text, where }); };
    const isSelected = text => selected.some(s => norm(s.text) === norm(text) || norm(s.text).includes(norm(text)));
    const findRow = text => {
        const n = norm(text);
        return pick(candidates.filter(r => norm(r.text) === n)) || pick(candidates.filter(r => norm(r.text).includes(n)));
    };

    for (const st of statements) {
        if (isSelected(st.text)) { plan.present.push(st); continue; }
        const row = findRow(st.text);
        if (row) { tick(row, st.where); continue; }
        // A report statement can join several library rows (a Pinatubo lahar
        // projection followed by its zone definitions); try each sentence.
        const parts = sentences(st.text);
        if (parts.length > 1) {
            const rows = parts.map(p => isSelected(p) ? 'present' : findRow(p));
            if (rows.every(Boolean)) {
                rows.forEach(r => { if (r !== 'present') tick(r, st.where); });
                continue;
            }
        }
        const best = candidates.map(r => [r, similarity(norm(st.text), norm(r.text))]).sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] >= NEAR_THRESHOLD) {
            plan.near.push({ statement: st.text, where: st.where, id: best[0].id, libraryText: best[0].text, score: best[1] });
        } else {
            plan.missing.push({ statement: st.text, where: st.where });
        }
    }

    plan.extra = selected.filter(s => !statements.some(st =>
        norm(s.text) === norm(st.text) || norm(s.text).includes(norm(st.text)) || norm(st.text).includes(norm(s.text))));
    return plan;
}

/**
 * The order the assessment's statements should take, following the report:
 * intro, hazard sections, common statements, supersedes. Numbered from 0, as
 * HAS Admin's Order dropdowns are. Statements the report doesn't use go last,
 * unnumbered, so they stand out for review. PHAST only shows this order; the
 * assessor sets the dropdowns, each of which saves as soon as it changes.
 *
 * @param {{text: string}[]} statements  From reportStatements(), in report order
 * @param {{text: string, order?: string|null}[]} selected  The assessment's statements
 * @returns {{text: string, current: number|null, suggested: number|null}[]}
 */
export function suggestOrder(statements, selected, { volcano = '', pav = '' } = {}) {
    const norm = canonical([volcano, pav]);
    const covers = (sel, st) => norm(sel) === norm(st) || norm(sel).includes(norm(st)) || norm(st).includes(norm(sel));
    const ranked = selected.map((s, i) => {
        const index = statements.findIndex(st => covers(s.text, st.text));
        const current = s.order === null || s.order === undefined || s.order === '' ? null : Number(s.order);
        return { text: s.text, current: Number.isNaN(current) ? null : current, index, position: i };
    });
    const inReport = ranked.filter(r => r.index >= 0)
        .sort((a, b) => a.index - b.index || (a.current ?? a.position) - (b.current ?? b.position));
    const notInReport = ranked.filter(r => r.index < 0);
    return [
        ...inReport.map((r, n) => ({ text: r.text, current: r.current, suggested: n })),
        ...notInReport.map(r => ({ text: r.text, current: r.current, suggested: null })),
    ];
}
