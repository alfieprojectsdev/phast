/**
 * Overlay crop helpers (window.PHAST.crop in src/inject/map-handlers.js).
 * Run: node --test tests/overlay-crop.test.mjs
 *
 * map-handlers.js is a classic script injected into the page, not a module,
 * so it is loaded into a vm with just enough of `window` and `document` for
 * its top level to run. Only the pure crop helpers are exercised here; the
 * crop dialog and the PDF rendering are checked by hand in tests/mock-page.html.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

const context = { window: {}, document: { currentScript: null }, console: { log() {} } };
vm.createContext(context);
vm.runInContext(read('../src/inject/map-handlers.js'), context);
const crop = context.window.PHAST.crop;

// Operator codes from the vendored PDF.js build, so the tests follow the
// library the extension actually ships.
const pdfjsSource = read('../src/vendor/pdfjs/pdf.min.js');
const opCode = name => {
    const m = pdfjsSource.match(new RegExp(`[,{]${name}:(\\d+)`));
    return m ? Number(m[1]) : undefined;
};
const OPS = Object.fromEntries(
    ['save', 'restore', 'transform', 'paintFormXObjectBegin', 'paintFormXObjectEnd',
     'paintImageXObject', 'paintInlineImageXObject', 'paintJpegXObject']
        .map(n => [n, opCode(n)])
);

// A4 page (595 x 842 pt) rendered at scale 2, as renderPdfPage does.
const VIEWPORT = [2, 0, 0, -2, 0, 1684];
// An image pasted into Word: 451 x 338.25 pt, 72 pt from the left edge and
// 120 pt from the top, so its bottom-left corner is at y = 842 - 120 - 338.25.
const WORD_IMAGE = [451, 0, 0, 338.25, 72, 383.75];
const WORD_IMAGE_BOX = { x: 144, y: 240, w: 902, h: 676.5 };

function ops(...steps) {
    return { fnArray: steps.map(s => OPS[s[0]]), argsArray: steps.map(s => s[1] ?? null) };
}
const boxOf = o => crop.imageBoxFromOps(o.fnArray, o.argsArray, OPS, VIEWPORT);
const plain = v => JSON.parse(JSON.stringify(v)); // vm objects -> this realm, for deepEqual

describe('operator codes', () => {
    test('vendored PDF.js defines the codes the helper needs', () => {
        for (const name of ['save', 'restore', 'transform', 'paintFormXObjectBegin',
                            'paintFormXObjectEnd', 'paintImageXObject', 'paintInlineImageXObject']) {
            assert.equal(typeof OPS[name], 'number', name);
        }
    });
});

describe('multiply', () => {
    test('applies the right-hand matrix first, like pdfjsLib.Util.transform', () => {
        // Scale by 2, then translate by (10, 20): the point (1, 1) lands on (12, 22).
        const m = crop.multiply([1, 0, 0, 1, 10, 20], [2, 0, 0, 2, 0, 0]);
        assert.deepEqual(plain(m), [2, 0, 0, 2, 10, 20]);
    });
});

describe('imageBoxFromOps', () => {
    test('Word-style page: one image under a cm transform → its box on the 2x canvas', () => {
        const box = boxOf(ops(['save'], ['transform', WORD_IMAGE], ['paintImageXObject', ['img1', 0, 0]], ['restore']));
        assert.deepEqual(plain(box), WORD_IMAGE_BOX);
    });

    test('inline images count too', () => {
        const box = boxOf(ops(['save'], ['transform', WORD_IMAGE], ['paintInlineImageXObject', [{}]], ['restore']));
        assert.deepEqual(plain(box), WORD_IMAGE_BOX);
    });

    test('a transform inside save/restore does not leak to later images', () => {
        const box = boxOf(ops(
            ['save'], ['transform', [10, 0, 0, 10, 0, 0]], ['restore'],
            ['save'], ['transform', WORD_IMAGE], ['paintImageXObject', ['img1']], ['restore'],
        ));
        assert.deepEqual(plain(box), WORD_IMAGE_BOX);
    });

    test('image inside a form XObject uses the form matrix', () => {
        // The form shifts everything 72 pt right and 383.75 pt up; the image
        // inside only scales.
        const box = boxOf(ops(
            ['paintFormXObjectBegin', [[1, 0, 0, 1, 72, 383.75], [0, 0, 595, 842]]],
            ['save'], ['transform', [451, 0, 0, 338.25, 0, 0]], ['paintImageXObject', ['img1']], ['restore'],
            ['paintFormXObjectEnd'],
        ));
        assert.deepEqual(plain(box), WORD_IMAGE_BOX);
    });

    test('picks the largest of several images (map over a logo)', () => {
        const box = boxOf(ops(
            ['save'], ['transform', [40, 0, 0, 40, 500, 780]], ['paintImageXObject', ['logo']], ['restore'],
            ['save'], ['transform', WORD_IMAGE], ['paintImageXObject', ['map']], ['restore'],
        ));
        assert.deepEqual(plain(box), WORD_IMAGE_BOX);
    });

    test('no image on the page → null', () => {
        assert.equal(boxOf(ops(['save'], ['transform', [1, 0, 0, 1, 0, 0]], ['restore'])), null);
    });
});

describe('trimMarginBox', () => {
    function page(width, height, paint) {
        const data = new Uint8ClampedArray(width * height * 4).fill(255);
        for (const [x, y, rgba] of paint) data.set(rgba, (y * width + x) * 4);
        return data;
    }

    test('finds the non-white area', () => {
        const paint = [];
        for (let y = 3; y <= 6; y++) for (let x = 2; x <= 8; x++) paint.push([x, y, [0, 0, 0, 255]]);
        assert.deepEqual(plain(crop.trimMarginBox(page(12, 10, paint), 12, 10)), { x: 2, y: 3, w: 7, h: 4 });
    });

    test('near-white (above the threshold) counts as margin', () => {
        assert.equal(crop.trimMarginBox(page(4, 4, [[1, 1, [250, 250, 250, 255]]]), 4, 4), null);
    });

    test('transparent pixels are ignored', () => {
        assert.equal(crop.trimMarginBox(page(4, 4, [[1, 1, [0, 0, 0, 0]]]), 4, 4), null);
    });

    test('blank page → null', () => {
        assert.equal(crop.trimMarginBox(page(5, 5, []), 5, 5), null);
    });
});

describe('clampRect', () => {
    test('rounds outward to whole pixels', () => {
        assert.deepEqual(plain(crop.clampRect({ x: 10.6, y: 20.2, w: 5.1, h: 5.1 }, 100, 100)), { x: 10, y: 20, w: 6, h: 6 });
    });

    test('clamps to the canvas', () => {
        assert.deepEqual(plain(crop.clampRect({ x: -5, y: 90, w: 20, h: 30 }, 100, 100)), { x: 0, y: 90, w: 15, h: 10 });
    });
});

describe('suggestPdfCrop', () => {
    const W = 1190, H = 1684;

    test('prefers the embedded image', () => {
        const trim = { x: 100, y: 100, w: 1000, h: 1400 };
        assert.deepEqual(plain(crop.suggestPdfCrop(WORD_IMAGE_BOX, trim, W, H)), { x: 144, y: 240, w: 902, h: 677 });
    });

    test('an image under 5% of the page (a logo) falls back to the margin trim', () => {
        const logo = { x: 1000, y: 40, w: 80, h: 80 };
        const trim = { x: 100, y: 100, w: 1000, h: 1400 };
        assert.deepEqual(plain(crop.suggestPdfCrop(logo, trim, W, H)), trim);
    });

    test('no image and no margins worth trimming → null (start with the whole page)', () => {
        assert.equal(crop.suggestPdfCrop(null, { x: 0, y: 0, w: W, h: H }, W, H), null);
    });

    test('nothing found at all → null', () => {
        assert.equal(crop.suggestPdfCrop(null, null, W, H), null);
    });
});
