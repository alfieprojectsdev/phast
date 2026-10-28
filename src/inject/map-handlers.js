// Map Handlers - Injected into MAIN world
// Access to 'map', 'L', 'drawnItems'

window.PHAST = window.PHAST || {};

// Base URL of the extension package, e.g. "chrome-extension://<id>/".
//
// Third-party libraries are vendored under src/vendor/ rather than pulled from
// unpkg/cdnjs at runtime, because the PHIVOLCS LAN may have no egress — a CDN
// script tag there fails or hangs the whole action awaiting timeout.
//
// This file runs in the MAIN world, where chrome.runtime.getURL is unavailable.
// But the loader injected it via chrome.runtime.getURL, so its own <script src>
// is already an absolute chrome-extension:// URL — the base is derivable from
// it without any cross-world messaging. Captured at top level while
// document.currentScript is still valid.
window.PHAST.extBase = window.PHAST.extBase || (function () {
    const marker = 'src/inject/map-handlers.js';
    const src = document.currentScript && document.currentScript.src;
    return src && src.includes(marker) ? src.slice(0, src.indexOf(marker)) : '';
})();

// --- OVERLAY CROP HELPERS ---
// Pure functions (no DOM, no Leaflet) so tests/overlay-crop.test.mjs can load
// this file in a vm and call them directly.
window.PHAST.crop = (function () {
    // Affine matrices as PDF.js uses them: [a, b, c, d, e, f]. Same result as
    // pdfjsLib.Util.transform(m1, m2), i.e. apply m2 first, then m1.
    function multiply(m1, m2) {
        return [
            m1[0] * m2[0] + m1[2] * m2[1],
            m1[1] * m2[0] + m1[3] * m2[1],
            m1[0] * m2[2] + m1[2] * m2[3],
            m1[1] * m2[2] + m1[3] * m2[3],
            m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
            m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
        ];
    }

    // Where the largest embedded image lands on the rendered page, in canvas
    // pixels. A map pasted into Word and exported as PDF is one image XObject
    // drawn into the unit square under the current transform, so tracking the
    // transform through the operator list gives its exact box, captions and
    // margins excluded. Returns null when the page has no image.
    function imageBoxFromOps(fnArray, argsArray, OPS, viewportTransform) {
        const paintOps = new Set(
            [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintJpegXObject]
                .filter(op => op !== undefined)
        );
        let ctm = viewportTransform.slice();
        const stack = [];
        let best = null;
        for (let i = 0; i < fnArray.length; i++) {
            const fn = fnArray[i];
            const args = argsArray[i];
            if (fn === OPS.save) {
                stack.push(ctm);
            } else if (fn === OPS.restore) {
                ctm = stack.pop() || ctm;
            } else if (fn === OPS.transform) {
                ctm = multiply(ctm, args);
            } else if (fn === OPS.paintFormXObjectBegin) {
                stack.push(ctm);
                if (args && Array.isArray(args[0])) ctm = multiply(ctm, args[0]);
            } else if (fn === OPS.paintFormXObjectEnd) {
                ctm = stack.pop() || ctm;
            } else if (paintOps.has(fn)) {
                const xs = [], ys = [];
                for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                    xs.push(ctm[0] * u + ctm[2] * v + ctm[4]);
                    ys.push(ctm[1] * u + ctm[3] * v + ctm[5]);
                }
                const box = {
                    x: Math.min(...xs), y: Math.min(...ys),
                    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
                };
                if (!best || box.w * box.h > best.w * best.h) best = box;
            }
        }
        return best;
    }

    // Bounding box of everything that isn't near-white, for PDFs whose map
    // isn't a single image (scans, vector drawings). `data` is RGBA, as in
    // ImageData. Returns null for a blank page.
    function trimMarginBox(data, width, height, threshold = 245) {
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                if (data[i + 3] < 16) continue;
                if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    // Whole pixels, inside the canvas. Rounds outward so nothing is shaved off.
    function clampRect(r, width, height) {
        const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
        const x1 = Math.min(width, Math.ceil(r.x + r.w)), y1 = Math.min(height, Math.ceil(r.y + r.h));
        return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    }

    // The crop a PDF page starts with: the largest embedded image if it is a
    // real part of the page (at least 5% of it), else the non-white area, else
    // the whole page. Returns null when the suggestion would be the whole page.
    function suggestPdfCrop(imageBox, trimBox, width, height) {
        const area = width * height;
        const pick = [imageBox, trimBox]
            .map(b => b && clampRect(b, width, height))
            .find(b => b && b.w * b.h >= area * 0.05);
        return pick && pick.w * pick.h < area * 0.98 ? pick : null;
    }

    return { multiply, imageBoxFromOps, trimMarginBox, clampRect, suggestPdfCrop };
})();

// --- MAP OVERLAY LOGIC ---
// --- MAP OVERLAY LOGIC ---
window.PHAST.overlayVicinityMap = function () {
    console.log('PHAST: Overlaying Vicinity Map...');

    if (typeof map === 'undefined' || typeof L === 'undefined') {
        alert('⚠️ Leaflet map not found on this page.');
        return;
    }

    // The previous overlay is removed in showOverlay, only once the new one is
    // ready, so cancelling the picker or the crop keeps the aligned overlay.

    // Stretch handles go first: once the overlay is off the map, removing a
    // handle throws inside leaflet-distortableimage (its _unbindListeners reads
    // state the overlay's removal has already cleared), which used to abort a
    // second "Overlay Vicinity Map" halfway through.
    function removeVicinityOverlay() {
        if (window._stretchHandles) {
            window._stretchHandles.forEach(h => { if (h._map) map.removeLayer(h); });
            window._stretchHandles = null;
        }
        if (window._vicinityOverlay) {
            // The library leaves its own corner handles on the map (its
            // removeHooks loops over the handle names, not the layers), and a
            // handle can only be removed while the overlay is still on the map.
            // So: switch editing off, take the handle groups off, then remove
            // the overlay, whose onRemove finds editing already disabled.
            const editing = window._vicinityOverlay.editing;
            if (editing) {
                if (editing.enabled()) editing.disable();
                Object.values(editing._handles || {}).forEach(g => { if (map.hasLayer(g)) map.removeLayer(g); });
            }
            map.removeLayer(window._vicinityOverlay);
            window._vicinityOverlay = null;
        }
        if (window._vicinityPanel) {
            window._vicinityPanel.remove();
            window._vicinityPanel = null;
        }
    }

    // Find vicinity map attachments (PDF, JPG, PNG)
    let candidates = [];
    let imageExts = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff'];
    let vicinityKeywords = ['vicinity', ' vm ', 'site map', 'site_map', 'sitemap', 'location map'];
    let links = document.querySelectorAll('span.text-primary');

    for (let span of links) {
        let name = span.innerText.trim();
        let nameLower = name.toLowerCase();

        // Skip if it looks like a date/category (primitive check, but file ext check usually handles it)
        if (!imageExts.some(e => nameLower.endsWith(e))) continue;
        if (nameLower.endsWith('.kml') || nameLower.endsWith('.kmz')) continue;

        let row = span.closest('tr');
        if (!row) continue;

        let dl = row.querySelector("a[href*='download'], a[download]");
        if (!dl) continue;

        let url = dl.href.startsWith('http') ? dl.href : location.origin + dl.getAttribute('href');
        let rowText = row.innerText.toLowerCase();

        let isVicinity = vicinityKeywords.some(kw => nameLower.includes(kw) || rowText.includes(kw));

        // Extract Date (Column 4, index 3)
        let date = "Unknown Date";
        if (row.cells && row.cells.length > 3) {
            date = row.cells[3].innerText.trim();
        }

        candidates.push({ url: url, name: name, ext: imageExts.find(e => nameLower.endsWith(e)), isVicinity: isVicinity, date: date });
    }

    // Deduplicate (sometimes multiple spans map to same file in table)
    const uniqueCandidates = [];
    const seenUrls = new Set();
    candidates.forEach(c => {
        if (!seenUrls.has(c.url)) {
            seenUrls.add(c.url);
            uniqueCandidates.push(c);
        }
    });

    if (uniqueCandidates.length === 0) {
        alert('⚠️ No image or PDF attachments found on this page.');
        return;
    }

    // Prefer vicinity maps
    let vicinityMaps = uniqueCandidates.filter(c => c.isVicinity);
    let finalCandidates = vicinityMaps.length > 0 ? vicinityMaps : uniqueCandidates;

    if (finalCandidates.length === 1) {
        processChosen(finalCandidates[0]);
    } else {
        showSelectionModal(finalCandidates, processChosen);
    }

    function processChosen(chosen) {
        // Load dependencies, let the assessor crop, then show the overlay.
        loadDependencies()
            .catch(() => { throw new Error('Could not load distortable image library.'); })
            .then(() => chosen.ext === '.pdf' ? renderPdfPage(chosen.url) : loadImageSource(chosen.url))
            .then(source => showCropModal(source, chosen.name).then(choice => {
                // The original image blob is only needed for "Use whole image".
                if (!(choice && choice.whole) && source.release) source.release();
                if (!choice) return; // cancelled
                showOverlay(choice.whole ? source.wholeUrl() : cropToDataUrl(source.canvas, choice.rect), chosen.name);
            }))
            .catch(err => alert('Error loading vicinity map: ' + err.message));
    }

    // { canvas, suggested, wholeUrl } for an image attachment. The image is
    // fetched to a blob first, so drawing it on a canvas never taints it.
    // "Use whole image" overlays the original blob, exactly as before cropping
    // existed.
    function loadImageSource(url) {
        return fetch(url)
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.blob();
            })
            .then(blob => new Promise((resolve, reject) => {
                const objectUrl = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    resolve({
                        canvas, suggested: null,
                        wholeUrl: () => objectUrl,
                        release: () => URL.revokeObjectURL(objectUrl),
                    });
                };
                img.onerror = () => reject(new Error('the file is not a readable image'));
                img.src = objectUrl;
            }));
    }

    // Cut the selected rectangle out of the full-resolution canvas.
    function cropToDataUrl(canvas, rect) {
        const out = document.createElement('canvas');
        out.width = rect.w;
        out.height = rect.h;
        out.getContext('2d').drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        return out.toDataURL('image/png');
    }

    // Lets the assessor drag a rectangle over the part of the map to overlay.
    // Resolves { rect } in source pixels, { whole: true }, or null if cancelled.
    function showCropModal(source, fileName) {
        return new Promise(resolve => {
            const existing = document.getElementById('phast-crop-modal');
            if (existing) existing.remove();

            const srcW = source.canvas.width, srcH = source.canvas.height;
            const fit = Math.min(
                Math.min(Math.max(window.innerWidth * 0.9 - 40, 160), 1100) / srcW,
                Math.max(window.innerHeight * 0.92 - 150, 120) / srcH,
                1
            );
            const viewW = Math.max(1, Math.round(srcW * fit)), viewH = Math.max(1, Math.round(srcH * fit));
            const toView = r => ({ x: r.x * fit, y: r.y * fit, w: r.w * fit, h: r.h * fit });

            const modal = document.createElement('div');
            modal.id = 'phast-crop-modal';
            modal.style.cssText = `
                position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 11000;
                display: flex; justify-content: center; align-items: center; font-family: sans-serif;
            `;
            const panel = document.createElement('div');
            panel.style.cssText = `
                background: white; padding: 16px 20px; border-radius: 8px; max-width: 94vw;
                box-shadow: 0 4px 16px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 10px;
            `;
            const title = document.createElement('div');
            title.style.cssText = 'font-weight: bold;';
            title.textContent = 'Crop vicinity map: ' + fileName;
            const hint = document.createElement('div');
            hint.style.cssText = 'font-size: 12px; color: #555;';
            hint.textContent = (source.suggested
                ? 'The selection starts on the map image found in the PDF. '
                : '') + 'Drag to select the part to overlay; drag inside the selection to move it, or its corners to resize. Enter applies, Esc cancels.';

            const stage = document.createElement('div');
            stage.style.cssText = `position: relative; width: ${viewW}px; height: ${viewH}px; overflow: hidden;
                cursor: crosshair; user-select: none; touch-action: none; align-self: center; background: #eee;`;
            const preview = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            preview.width = Math.round(viewW * dpr);
            preview.height = Math.round(viewH * dpr);
            preview.style.cssText = `width: ${viewW}px; height: ${viewH}px; display: block;`;
            preview.getContext('2d').drawImage(source.canvas, 0, 0, preview.width, preview.height);

            const sel = document.createElement('div');
            sel.style.cssText = `position: absolute; box-sizing: border-box; border: 2px dashed #e74c3c;
                box-shadow: 0 0 0 9999px rgba(0,0,0,0.45); cursor: move;`;
            ['nw', 'ne', 'sw', 'se'].forEach(corner => {
                const h = document.createElement('div');
                h.dataset.corner = corner;
                h.style.cssText = `position: absolute; width: 12px; height: 12px; background: #e74c3c;
                    border: 2px solid white; box-sizing: border-box;
                    ${corner[0] === 'n' ? 'top' : 'bottom'}: -7px; ${corner[1] === 'w' ? 'left' : 'right'}: -7px;
                    cursor: ${corner === 'nw' || corner === 'se' ? 'nwse' : 'nesw'}-resize;`;
                sel.appendChild(h);
            });
            stage.appendChild(preview);
            stage.appendChild(sel);

            const size = document.createElement('div');
            size.style.cssText = 'font-size: 12px; color: #555; min-height: 1em;';

            const buttons = document.createElement('div');
            buttons.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px;';
            const mkBtn = (label, primary) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.style.cssText = `padding: 8px 14px; border-radius: 4px; cursor: pointer; border: 1px solid ${primary ? '#2c3e50' : '#bbb'};
                    background: ${primary ? '#2c3e50' : '#f4f4f4'}; color: ${primary ? 'white' : '#222'};`;
                return b;
            };
            const cancelBtn = mkBtn('Cancel'), wholeBtn = mkBtn('Use whole image'), applyBtn = mkBtn('Apply crop', true);
            buttons.append(cancelBtn, wholeBtn, applyBtn);

            panel.append(title, hint, stage, size, buttons);
            modal.appendChild(panel);
            document.body.appendChild(modal);

            // Selection in view (CSS) pixels.
            let rect = source.suggested ? toView(source.suggested) : { x: 0, y: 0, w: viewW, h: viewH };
            const MIN = 8;
            const draw = () => {
                Object.assign(sel.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
                const r = toSource();
                size.textContent = `Selection: ${r.w} × ${r.h} px of ${srcW} × ${srcH}`;
                applyBtn.disabled = rect.w < MIN || rect.h < MIN;
            };
            // While the suggested selection is untouched, use it exactly: going
            // through view pixels and back can add a row or column.
            const initial = rect;
            const toSource = () => rect === initial && source.suggested ? source.suggested : window.PHAST.crop.clampRect(
                { x: rect.x / fit, y: rect.y / fit, w: rect.w / fit, h: rect.h / fit }, srcW, srcH);
            const point = e => {
                const b = stage.getBoundingClientRect();
                return { x: Math.min(Math.max(e.clientX - b.left, 0), viewW), y: Math.min(Math.max(e.clientY - b.top, 0), viewH) };
            };

            let drag = null;
            stage.addEventListener('pointerdown', e => {
                e.preventDefault();
                const p = point(e);
                const corner = e.target.dataset && e.target.dataset.corner;
                if (corner) {
                    // Resize: the opposite corner stays put.
                    const ax = corner[1] === 'w' ? rect.x + rect.w : rect.x;
                    const ay = corner[0] === 'n' ? rect.y + rect.h : rect.y;
                    drag = { mode: 'draw', ax, ay };
                } else if (e.target === sel && (rect.w < viewW - 1 || rect.h < viewH - 1)) {
                    // Moving only makes sense for a selection smaller than the
                    // image; when it covers everything (the starting state for
                    // images), a drag draws a new one instead.
                    drag = { mode: 'move', dx: p.x - rect.x, dy: p.y - rect.y };
                } else {
                    drag = { mode: 'draw', ax: p.x, ay: p.y, prev: rect };
                    rect = { x: p.x, y: p.y, w: 0, h: 0 };
                }
                stage.setPointerCapture(e.pointerId);
                draw();
            });
            stage.addEventListener('pointermove', e => {
                if (!drag) return;
                const p = point(e);
                if (drag.mode === 'move') {
                    // A new object, so toSource sees the selection has changed.
                    rect = {
                        x: Math.min(Math.max(p.x - drag.dx, 0), viewW - rect.w),
                        y: Math.min(Math.max(p.y - drag.dy, 0), viewH - rect.h),
                        w: rect.w, h: rect.h,
                    };
                } else {
                    rect = {
                        x: Math.min(drag.ax, p.x), y: Math.min(drag.ay, p.y),
                        w: Math.abs(p.x - drag.ax), h: Math.abs(p.y - drag.ay),
                    };
                }
                draw();
            });
            // A click without a drag would leave a 0 x 0 selection; keep the
            // previous one instead (a stray click shouldn't lose the PDF suggestion).
            const endDrag = () => {
                if (drag && drag.prev && (rect.w < MIN || rect.h < MIN)) {
                    rect = drag.prev;
                    draw();
                }
                drag = null;
            };
            stage.addEventListener('pointerup', endDrag);
            stage.addEventListener('pointercancel', endDrag);

            const close = result => {
                document.removeEventListener('keydown', onKey, true);
                modal.remove();
                resolve(result);
            };
            const apply = () => {
                if (applyBtn.disabled) return;
                const r = toSource();
                // A selection that is the whole image is the same as not cropping.
                close(r.w >= srcW && r.h >= srcH ? { whole: true } : { rect: r });
            };
            const onKey = e => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
                else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply(); }
            };
            document.addEventListener('keydown', onKey, true);
            cancelBtn.addEventListener('click', () => close(null));
            wholeBtn.addEventListener('click', () => close({ whole: true }));
            applyBtn.addEventListener('click', apply);
            draw();
        });
    }

    // Attachment names come from whoever filed the request, so they are text,
    // never markup.
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function showSelectionModal(options, callback) {
        // Remove existing modal if any
        let existing = document.getElementById('phat-vm-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'phat-vm-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 11000;
            display: flex; justify-content: center; align-items: center; font-family: sans-serif;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white; padding: 20px; border-radius: 8px; width: 500px; max-height: 80%;
            overflow-y: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;

        content.innerHTML = `
            <h3 style="margin-top:0;">Select Vicinity Map</h3>
            <p>Multiple candidates found. Please select which one to overlay:</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${options.map((opt, idx) => `
                    <button class="phat-vm-option" data-idx="${idx}" style="
                        padding: 10px; text-align: left; border: 1px solid #ddd; border-radius: 4px;
                        background: #f9f9f9; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
                    ">
                        <div>
                            <strong>${escapeHtml(opt.name)}</strong><br>
                            <small style="color: #666;">Uploaded: ${escapeHtml(opt.date)}</small>
                        </div>
                        <div style="color: #007bff;">Select &rarr;</div>
                    </button>
                `).join('')}
            </div>
            <button id="phat-vm-cancel" style="margin-top: 15px; width: 100%; padding: 8px;">Cancel</button>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Event Listeners
        content.querySelectorAll('.phat-vm-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                modal.remove();
                callback(options[idx]);
            });
        });

        document.getElementById('phat-vm-cancel').addEventListener('click', () => modal.remove());
    }

    function loadDependencies() {
        return new Promise((resolve, reject) => {
            if (typeof L.DistortableImageOverlay !== 'undefined') {
                resolve();
                return;
            }

            // Vendored copy of leaflet-distortableimage@0.21.9 (see extBase above).
            const repo = `${window.PHAST.extBase}src/vendor/leaflet-distortableimage`;
            const cssFiles = ['vendor.css', 'leaflet.distortableimage.css'];

            // Load CSS
            cssFiles.forEach(file => {
                if (!document.querySelector(`link[href*="${file}"]`)) {
                    let css = document.createElement('link');
                    css.rel = 'stylesheet';
                    css.href = `${repo}/${file}`;
                    document.head.appendChild(css);
                }
            });

            // Inject Custom CSS
            const customStyleId = 'vicinity-map-bookmarklet-style';
            if (!document.getElementById(customStyleId)) {
                let style = document.createElement('style');
                style.id = customStyleId;
                style.type = 'text/css';
                style.innerHTML = `
                    .leaflet-popup-toolbar, .leaflet-control-toolbar, .leaflet-toolbar {
                        z-index: 10000 !important;
                    }
                    .leaflet-image-layer.leaflet-interactive {
                        z-index: 9999 !important;
                    }
                `;
                document.head.appendChild(style);
            }

            // Load JS sequentially: vendor -> lib
            const loadScript = (src) => {
                return new Promise((res, rej) => {
                    if (document.querySelector(`script[src="${src}"]`)) {
                        res();
                        return;
                    }
                    let s = document.createElement('script');
                    s.src = src;
                    s.onload = res;
                    s.onerror = rej;
                    document.head.appendChild(s);
                });
            };

            loadScript(`${repo}/vendor.js`)
                .then(() => loadScript(`${repo}/leaflet.distortableimage.js`))
                .then(() => {
                    console.log('✅ Distortable Image Library Loaded');
                    patchDistortableClasses();
                    resolve();
                })
                .catch(err => {
                    console.error('Failed to load dependencies', err);
                    reject(err);
                });
        });
    }

    function patchDistortableClasses() {
        if (!L.ScaleHandle || !L.RotateHandle) {
            console.error('L.ScaleHandle or L.RotateHandle not found');
            return;
        }
        console.log('Patching L.ScaleHandle and L.RotateHandle prototypes for Fixed Anchor Logic...');

        L.ScaleHandle.include({
            _onHandleDrag: function () {
                var overlay = this._handled;
                var map = overlay._map;
                var anchorIdx = 3 - this._corner;
                var corners = overlay.getCorners();
                var anchorLatLng = corners[anchorIdx];
                var anchorPoint = map.latLngToLayerPoint(anchorLatLng);

                var mouseLatLng = this.getLatLng();
                var mousePoint = map.latLngToLayerPoint(mouseLatLng);

                var currentHandleLatLng = corners[this._corner];
                var currentHandlePoint = map.latLngToLayerPoint(currentHandleLatLng);

                var ux = currentHandlePoint.x - anchorPoint.x;
                var uy = currentHandlePoint.y - anchorPoint.y;
                var uLen = Math.sqrt(ux * ux + uy * uy);

                if (uLen < 1) return;

                var uHat = { x: ux / uLen, y: uy / uLen };
                var vx = mousePoint.x - anchorPoint.x;
                var vy = mousePoint.y - anchorPoint.y;
                var projLen = vx * uHat.x + vy * uHat.y;

                var scale = projLen / uLen;

                var newCorners = corners.map(function (c, i) {
                    if (i === anchorIdx) return anchorLatLng;
                    var p = map.latLngToLayerPoint(c);
                    var vecX = p.x - anchorPoint.x;
                    var vecY = p.y - anchorPoint.y;
                    var nx = anchorPoint.x + vecX * scale;
                    var ny = anchorPoint.y + vecY * scale;
                    return map.layerPointToLatLng(L.point(nx, ny));
                });

                overlay.setCorners(newCorners);
            }
        });

        L.RotateHandle.include({
            _onHandleDrag: function () {
                var overlay = this._handled;
                var map = overlay._map;
                var anchorIdx = 3 - this._corner;
                var corners = overlay.getCorners();
                var anchorLatLng = corners[anchorIdx];
                var anchorPoint = map.latLngToLayerPoint(anchorLatLng);

                var mouseLatLng = this.getLatLng();
                var mousePoint = map.latLngToLayerPoint(mouseLatLng);

                var currentHandleLatLng = corners[this._corner];
                var currentHandlePoint = map.latLngToLayerPoint(currentHandleLatLng);

                var angleOld = Math.atan2(currentHandlePoint.y - anchorPoint.y, currentHandlePoint.x - anchorPoint.x);
                var angleNew = Math.atan2(mousePoint.y - anchorPoint.y, mousePoint.x - anchorPoint.x);
                var deltaAngle = angleNew - angleOld;

                var newCorners = corners.map(function (c, i) {
                    if (i === anchorIdx) return anchorLatLng;
                    var p = map.latLngToLayerPoint(c);
                    var dx = p.x - anchorPoint.x;
                    var dy = p.y - anchorPoint.y;
                    var cos = Math.cos(deltaAngle);
                    var sin = Math.sin(deltaAngle);
                    var nx = anchorPoint.x + dx * cos - dy * sin;
                    var ny = anchorPoint.y + dx * sin + dy * cos;
                    return map.layerPointToLatLng(L.point(nx, ny));
                });

                overlay.setCorners(newCorners);
            }
        });

        // Keep the distortable toolbar persistent: override the two singleclick-deselect
        // paths so clicking elsewhere on the map never dismisses the toolbar.
        if (L.DistortableImageOverlay) {
            L.DistortableImageOverlay.include({
                _singleClickListeners: function () { /* no-op */ },
                _singleClick:          function () { /* no-op */ }
            });
        }

        // --- STRETCH HANDLES ---
        // Defined here (post-load) so L.EditHandle is available.
        // Axis-constrained edge midpoint handles that reposition automatically
        // via overlay.on('update') — the same sync mechanism as ScaleHandle.
        L.StretchHandle = L.EditHandle.extend({

            initialize: function (overlay, cornerA, cornerB, options) {
                this._cornerA = cornerA;
                this._cornerB = cornerB;
                L.EditHandle.prototype.initialize.call(this, overlay, cornerA, options);
            },

            updateHandle: function () {
                var a = this._handled.getCorner(this._cornerA);
                var b = this._handled.getCorner(this._cornerB);
                this.setLatLng(L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2));
            },

            _onHandleDrag: function () {
                var overlay = this._handled;
                var map = overlay._map;
                var corners = overlay.getCorners();

                var pA = map.latLngToLayerPoint(corners[this._cornerA]);
                var pB = map.latLngToLayerPoint(corners[this._cornerB]);

                var oldMid = L.point((pA.x + pB.x) / 2, (pA.y + pB.y) / 2);
                var newMid = map.latLngToLayerPoint(this.getLatLng());
                var delta = newMid.subtract(oldMid);

                var edge = pB.subtract(pA);
                var edgeLen = Math.sqrt(edge.x * edge.x + edge.y * edge.y);
                if (edgeLen < 1) return;
                var perp = L.point(-edge.y / edgeLen, edge.x / edgeLen);

                var proj = delta.x * perp.x + delta.y * perp.y;
                var move = L.point(perp.x * proj, perp.y * proj);

                var newCorners = corners.slice();
                newCorners[this._cornerA] = map.layerPointToLatLng(pA.add(move));
                newCorners[this._cornerB] = map.layerPointToLatLng(pB.add(move));
                overlay.setCorners(newCorners);
            }
        });
    }

    function showOverlay(imageUrl, fileName) {
        removeVicinityOverlay();
        let bounds = map.getBounds();
        let center = map.getCenter();
        let latSpan = (bounds.getNorth() - bounds.getSouth()) * 0.35;
        let lngSpan = (bounds.getEast() - bounds.getWest()) * 0.35;

        let corners = [
            L.latLng(center.lat + latSpan, center.lng - lngSpan), // top-left
            L.latLng(center.lat + latSpan, center.lng + lngSpan), // top-right
            L.latLng(center.lat - latSpan, center.lng - lngSpan), // bottom-left
            L.latLng(center.lat - latSpan, center.lng + lngSpan)  // bottom-right
        ];

        createDistortable(imageUrl, fileName, corners);
    }

    function createDistortable(imageUrl, fileName, corners) {
        if (!map._toolbars) map._toolbars = {};
        if (!map.doubleClickLabels && L.Map.DoubleClickLabels) {
            map.addHandler('doubleClickLabels', L.Map.DoubleClickLabels);
            map.doubleClickLabels.enable(); // enabled()=true prevents library from binding deselect on map click
        }

        // Debug: Check actions
        if (!L.DragAction) console.error('L.DragAction missing');
        if (!L.ScaleAction) console.error('L.ScaleAction missing');

        const actions = [
            L.DragAction, L.ScaleAction, L.RotateAction,
            L.FreeRotateAction, L.LockAction, L.RestoreAction
        ];

        let overlay = L.distortableImageOverlay(imageUrl, {
            corners: corners,
            actions: actions,
            mode: 'drag',
            selected: true
        });

        overlay.addTo(map);
        window._vicinityOverlay = overlay;

        // Stretch handles — edge midpoints for axis-constrained H/V stretching.
        // Corners: 0=NW, 1=NE, 2=SW, 3=SE
        // Left edge: 0-2 | Right edge: 1-3 | Top edge: 0-1 | Bottom edge: 2-3
        var hIcon = L.divIcon({
            html: '<div style="width:14px;height:8px;background:#3498db;border:2px solid white;border-radius:2px;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
            iconSize: [14, 8], iconAnchor: [7, 4], className: ''
        });
        var vIcon = L.divIcon({
            html: '<div style="width:8px;height:14px;background:#3498db;border:2px solid white;border-radius:2px;cursor:ns-resize;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
            iconSize: [8, 14], iconAnchor: [4, 7], className: ''
        });
        window._stretchHandles = [
            new L.StretchHandle(overlay, 0, 2, { icon: hIcon }), // left edge
            new L.StretchHandle(overlay, 1, 3, { icon: hIcon }), // right edge
            new L.StretchHandle(overlay, 0, 1, { icon: vIcon }), // top edge
            new L.StretchHandle(overlay, 2, 3, { icon: vIcon })  // bottom edge
        ];
        window._stretchHandles.forEach(h => h.addTo(map));

        // Interaction conflicts
        function disableMapInteractions() {
            if (map.dragging && map.dragging.disable) map.dragging.disable();
            if (map.scrollWheelZoom && map.scrollWheelZoom.disable) map.scrollWheelZoom.disable();
            if (map.touchZoom && map.touchZoom.disable) map.touchZoom.disable();
            if (map.doubleClickZoom && map.doubleClickZoom.disable) map.doubleClickZoom.disable();
            if (map.boxZoom && map.boxZoom.disable) map.boxZoom.disable();
        }
        function enableMapInteractions() {
            if (map.dragging && map.dragging.enable) map.dragging.enable();
            if (map.scrollWheelZoom && map.scrollWheelZoom.enable) map.scrollWheelZoom.enable();
            if (map.touchZoom && map.touchZoom.enable) map.touchZoom.enable();
            if (map.doubleClickZoom && map.doubleClickZoom.enable) map.doubleClickZoom.enable();
            if (map.boxZoom && map.boxZoom.enable) map.boxZoom.enable();
        }
        overlay.on('enable', disableMapInteractions);
        overlay.on('disable', enableMapInteractions);
        overlay.on('dragstart', disableMapInteractions);

        // Control Panel
        let panel = document.createElement('div');
        panel.innerHTML = `
            <div style="position:absolute;top:10px;right:10px;background:white;border:1px solid #ccc;border-radius:8px;padding:12px;z-index:10000;font-family:sans-serif;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,0.2);min-width:240px;">
                <div style="font-weight:bold;margin-bottom:8px;">Vicinity Map Overlay</div>
                <div style="font-size:11px;color:#666;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${fileName}">${fileName}</div>
                <div style="margin-bottom:6px;">
                    <label>Opacity: <span id="_vm_opacity_val">50%</span></label><br>
                    <input type="range" id="_vm_opacity" min="0" max="100" value="50" style="width:100%;">
                </div>
                
                <!-- Blink Tool -->
                <button id="_vm_blink" style="background:#3498db;color:white;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;width:100%;margin-bottom:8px;font-size:11px;">Hold to Blink (Compare)</button>

                <!-- Nudge Controls -->
                <div style="display:flex;justify-content:center;align-items:center;margin-bottom:8px;">
                    <div style="display:grid;grid-template-columns:20px 20px 20px;gap:2px;">
                        <div></div>
                        <button class="_vm_nudge" data-dir="up" style="cursor:pointer;">&uarr;</button>
                        <div></div>
                        <button class="_vm_nudge" data-dir="left" style="cursor:pointer;">&larr;</button>
                        <div style="text-align:center;font-size:9px;color:#888;">Nudge</div>
                        <button class="_vm_nudge" data-dir="right" style="cursor:pointer;">&rarr;</button>
                        <div></div>
                        <button class="_vm_nudge" data-dir="down" style="cursor:pointer;">&darr;</button>
                        <div></div>
                    </div>
                </div>

                <div style="font-size:11px;color:#888;margin-bottom:8px;line-height:1.5;">
                    <b>Click image</b> to show toolbar:<br>
                    Drag &bull; Scale &bull; Rotate<br>
                    Drag <b>edge handles</b> to stretch H or V.
                </div>
                <button id="_vm_close" style="background:#e74c3c;color:white;border:none;border-radius:4px;padding:6px 16px;cursor:pointer;width:100%;">Remove Overlay</button>
            </div>
        `;
        map.getContainer().appendChild(panel);
        window._vicinityPanel = panel;
        L.DomEvent.disableClickPropagation(panel);
        L.DomEvent.disableScrollPropagation(panel);

        // Opacity helper
        function applyOpacity(v) {
            overlay.options.opacity = v;
            if (overlay._image) L.DomUtil.setOpacity(overlay._image, v);
        }

        // Opacity Slider
        let opacitySlider = panel.querySelector('#_vm_opacity');
        opacitySlider.addEventListener('input', function () {
            applyOpacity(this.value / 100);
            panel.querySelector('#_vm_opacity_val').textContent = this.value + '%';
        });

        // Blink Tool
        let blinkBtn = panel.querySelector('#_vm_blink');
        let blinkInterval;
        let preBlinkOpacity;

        function startBlink() {
            if (blinkInterval) return;
            preBlinkOpacity = overlay.options.opacity !== undefined ? overlay.options.opacity : 0.5;
            let blinkState = false;
            blinkInterval = setInterval(() => {
                applyOpacity(blinkState ? 0.8 : 0.2);
                blinkState = !blinkState;
            }, 500);
        }

        function stopBlink() {
            if (blinkInterval) {
                clearInterval(blinkInterval);
                blinkInterval = null;
                applyOpacity(preBlinkOpacity);
            }
        }

        blinkBtn.addEventListener('mousedown', startBlink);
        blinkBtn.addEventListener('mouseup', stopBlink);
        blinkBtn.addEventListener('mouseleave', stopBlink);
        // Touch support
        blinkBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startBlink(); });
        blinkBtn.addEventListener('touchend', stopBlink);


        // Nudge Controls
        panel.querySelectorAll('._vm_nudge').forEach(btn => {
            btn.addEventListener('click', (e) => {
                let dir = e.target.getAttribute('data-dir');
                let delta = 0.00001;
                let latFn = 0, lngFn = 0;

                if (dir === 'up') latFn = delta;
                if (dir === 'down') latFn = -delta;
                if (dir === 'left') lngFn = -delta;
                if (dir === 'right') lngFn = delta;

                // We need to move all corners by this delta
                // L.DistortableImageOverlay doesn't have a simple 'move' method that shifts everything easily if it's distorted
                // But we can shift the corners.

                let corners = overlay.getCorners(); // [NW, NE, SW, SE] usually
                let newCorners = corners.map(c => L.latLng(c.lat + latFn, c.lng + lngFn));

                overlay.setCorners(newCorners);
            });
        });

        // Set initial opacity — also reapply once the image element is ready
        applyOpacity(0.5);
        overlay.once('load', () => applyOpacity(0.5));

        panel.querySelector('#_vm_close').addEventListener('click', removeVicinityOverlay);
    }

    function loadPdfJs() {
        if (typeof pdfjsLib !== 'undefined') return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `${window.PHAST.extBase}src/vendor/pdfjs/pdf.min.js`;
            s.onload = () => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.PHAST.extBase}src/vendor/pdfjs/pdf.worker.min.js`;
                resolve();
            };
            s.onerror = () => reject(new Error('could not load PDF.js'));
            document.head.appendChild(s);
        });
    }

    // Page 1 rendered at 2x, plus a suggested crop: the embedded map image if
    // the page has one, otherwise the area inside the white margins.
    function renderPdfPage(url) {
        return loadPdfJs()
            .then(() => fetch(url))
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.arrayBuffer();
            })
            .then(buf => pdfjsLib.getDocument({ data: buf }).promise)
            .then(pdf => pdf.getPage(1))
            .then(page => {
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                const ctx = canvas.getContext('2d');
                return page.render({ canvasContext: ctx, viewport }).promise
                    .then(() => page.getOperatorList())
                    .then(ops => {
                        const crop = window.PHAST.crop;
                        const imageBox = crop.imageBoxFromOps(ops.fnArray, ops.argsArray, pdfjsLib.OPS, viewport.transform);
                        // The full-page pixel scan only runs when the embedded
                        // image doesn't settle the suggestion.
                        let suggested = crop.suggestPdfCrop(imageBox, null, canvas.width, canvas.height);
                        if (!suggested) {
                            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
                            const trimBox = crop.trimMarginBox(pixels.data, canvas.width, canvas.height);
                            suggested = crop.suggestPdfCrop(null, trimBox, canvas.width, canvas.height);
                        }
                        return {
                            canvas,
                            suggested,
                            wholeUrl: () => canvas.toDataURL('image/png'),
                        };
                    });
            });
    }
};

// --- KML IMPORT LOGIC ---
// --- KML IMPORT LOGIC ---
window.PHAST.importKML = function () {
    console.log('PHAST: Importing KML...');
    if (typeof map === 'undefined' || typeof drawnItems === 'undefined' || typeof L === 'undefined') {
        alert('⚠️ Leaflet map not found on this page.');
        return;
    }

    let files = [];
    let links = document.querySelectorAll('span.text-primary');

    for (let span of links) {
        let name = span.innerText.trim().toLowerCase();
        if (name.endsWith('.kmz') || name.endsWith('.kml')) {
            let row = span.closest('tr');
            if (!row) continue;
            let dl = row.querySelector("a[href*='download'], a[download]");
            if (dl) {
                let url = dl.href.startsWith('http') ? dl.href : location.origin + dl.getAttribute('href');
                files.push({ url: url, name: name });
            }
        }
    }

    if (files.length === 0) {
        alert('⚠️ No KML/KMZ files found on this page.');
        return;
    }

    // Parse KML XML to GeoJSON (minimal parser for polygons, lines, points)
    function kmlToGeoJSON(kmlText) {
        let parser = new DOMParser();
        let xml = parser.parseFromString(kmlText, 'text/xml');
        let features = [];

        function parseCoords(coordStr) {
            return coordStr.trim().split(/\s+/).map(c => {
                let parts = c.split(',').map(Number);
                return [parts[0], parts[1]]; // [lng, lat]
            }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
        }

        function getName(el) {
            let n = el.querySelector('name');
            return n ? n.textContent.trim() : null;
        }

        function getDescription(el) {
            let d = el.querySelector('description');
            return d ? d.textContent.trim() : null;
        }

        // Extract Placemarks
        let placemarks = xml.querySelectorAll('Placemark');
        for (let pm of placemarks) {
            let name = getName(pm);
            let desc = getDescription(pm);
            let props = {};
            if (name) props.name = name;
            if (desc) props.description = desc;

            // ExtendedData
            let simpleData = pm.querySelectorAll('SimpleData');
            for (let sd of simpleData) {
                let attr = sd.getAttribute('name');
                if (attr) props[attr] = sd.textContent.trim();
            }
            let dataEls = pm.querySelectorAll('Data');
            for (let d of dataEls) {
                let attr = d.getAttribute('name');
                let val = d.querySelector('value');
                if (attr && val) props[attr] = val.textContent.trim();
            }

            // Polygon
            let polygons = pm.querySelectorAll('Polygon');
            if (polygons.length > 0) {
                for (let poly of polygons) {
                    let outerRing = poly.querySelector('outerBoundaryIs coordinates');
                    if (outerRing) {
                        let coords = parseCoords(outerRing.textContent);
                        if (coords.length > 0) {
                            let rings = [coords];
                            let innerBounds = poly.querySelectorAll('innerBoundaryIs coordinates');
                            for (let ib of innerBounds) {
                                let inner = parseCoords(ib.textContent);
                                if (inner.length > 0) rings.push(inner);
                            }
                            features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } });
                        }
                    }
                }
                continue;
            }

            // LineString
            let lines = pm.querySelectorAll('LineString coordinates');
            if (lines.length > 0) {
                for (let line of lines) {
                    let coords = parseCoords(line.textContent);
                    if (coords.length > 0) {
                        features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
                    }
                }
                continue;
            }

            // Point
            let points = pm.querySelectorAll('Point coordinates');
            if (points.length > 0) {
                for (let pt of points) {
                    let coords = parseCoords(pt.textContent);
                    if (coords.length > 0) {
                        features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coords[0] } });
                    }
                }
            }
        }

        return { type: 'FeatureCollection', features: features };
    }

    function extractKml(res, fileName) {
        if (fileName.endsWith('.kmz')) {
            return res.arrayBuffer().then(buf => {
                if (typeof JSZip !== 'undefined') {
                    return JSZip.loadAsync(buf).then(zip => {
                        let kmlFile = Object.keys(zip.files).find(f => f.toLowerCase().endsWith('.kml'));
                        if (!kmlFile) throw new Error('No KML found inside ' + fileName);
                        return zip.files[kmlFile].async('string');
                    });
                }
                // Load JSZip dynamically
                return new Promise((resolve, reject) => {
                    if (document.querySelector('script[src*="jszip"]')) {
                        // Already loading? wait a bit? (Simple retry for V1)
                        setTimeout(() => {
                            if (typeof JSZip !== 'undefined') {
                                JSZip.loadAsync(buf).then(zip => {
                                    let kmlFile = Object.keys(zip.files).find(f => f.toLowerCase().endsWith('.kml'));
                                    if (!kmlFile) reject(new Error('No KML found inside ' + fileName));
                                    else zip.files[kmlFile].async('string').then(resolve).catch(reject);
                                }).catch(reject);
                            } else reject(new Error('JSZip failed to load'));
                        }, 1000);
                        return;
                    }

                    let s = document.createElement('script');
                    s.src = `${window.PHAST.extBase}src/vendor/jszip/jszip.min.js`;
                    s.onload = () => {
                        JSZip.loadAsync(buf).then(zip => {
                            let kmlFile = Object.keys(zip.files).find(f => f.toLowerCase().endsWith('.kml'));
                            if (!kmlFile) reject(new Error('No KML found inside ' + fileName));
                            else zip.files[kmlFile].async('string').then(resolve).catch(reject);
                        }).catch(reject);
                    };
                    s.onerror = () => reject(new Error('Failed to load JSZip library'));
                    document.head.appendChild(s);
                });
            });
        }
        return res.text();
    }

    // Fetch and process all files
    let names = files.map(f => f.name).join(', ');
    console.log('⏳ Fetching ' + files.length + ' file(s): ' + names);

    let allFeatures = [];
    let errors = [];

    Promise.all(files.map(file =>
        fetch(file.url)
            .then(res => {
                if (!res.ok) throw new Error(file.name + ': HTTP ' + res.status);
                return extractKml(res, file.name);
            })
            .then(kmlText => {
                let geojson = kmlToGeoJSON(kmlText);
                // Tag each feature with its source file
                geojson.features.forEach(f => f.properties._sourceFile = file.name);
                allFeatures.push(...geojson.features);
            })
            .catch(err => errors.push(file.name + ': ' + err.message))
    )).then(() => {
        if (allFeatures.length === 0) {
            alert('⚠️ No geometry found.' + (errors.length ? '\n\nErrors:\n' + errors.join('\n') : ''));
            return;
        }

        let geojson = { type: 'FeatureCollection', features: allFeatures };

        let layer = L.geoJSON(geojson, {
            style: { color: '#e74c3c', weight: 3, opacity: 0.8, fillOpacity: 0.2 },
            onEachFeature: function (feature, lyr) {
                let label = [feature.properties.name, feature.properties._sourceFile].filter(Boolean).join(' — ');
                if (label) lyr.bindPopup(label);
            }
        });

        layer.eachLayer(function (l) {
            drawnItems.addLayer(l);
        });

        map.fitBounds(layer.getBounds(), { padding: [50, 50] });

        let types = {};
        allFeatures.forEach(f => types[f.geometry.type] = (types[f.geometry.type] || 0) + 1);
        let desc = Object.entries(types).map(([k, v]) => v + ' ' + k + (v > 1 ? 's' : '')).join(', ');
        let msg = '✅ Imported ' + allFeatures.length + ' feature(s) from ' + files.length + ' file(s):\n' + desc;
        if (errors.length) msg += '\n\n⚠️ Errors:\n' + errors.join('\n');

        alert(msg);
    });
};

// --- ULAP CHECK LOGIC ---
window.PHAST.checkULAP = function () {
    try {
        const row = document.querySelector('#assessment-grid .items tbody tr');
        if (!row) throw new Error("No hazard assessment rows found.");

        const loc = row.cells[3].innerText.trim();
        const [lon, lat] = loc.split(',').map(x => parseFloat(x));

        if (isNaN(lat) || isNaN(lon)) throw new Error("Invalid coordinates: " + loc);

        const ulapURL = `https://ulap-portal.georisk.gov.ph/arcgis/apps/webappviewer/index.html?id=8f46bb981d874849b97e0c23f81f6b86&center=${lon},${lat}&level=17`;

        window.open(ulapURL, '_blank');
    } catch (e) {
        alert("❌ Failed: " + e.message);
    }
};

// --- GET DRAWN GEOJSON (for EIL-Viz handoff) ---
window.PHAST.getDrawnGeoJSON = function () {
    if (typeof drawnItems === 'undefined') return null;
    const geojson = drawnItems.toGeoJSON();
    if (!geojson.features || geojson.features.length === 0) return null;
    return JSON.stringify(geojson);
};

// --- CENTER MAP TO COORDINATES ---
window.PHAST.centerMapTo = function (lat, lon) {
    if (typeof map === 'undefined' || typeof L === 'undefined') {
        alert('⚠️ Leaflet map not found on this page.');
        return;
    }
    map.setView([lat, lon], 15);
};

// --- PARSE REQUEST COORDS ---
window.PHAST.parseRequestCoords = function () {
    if (typeof map === 'undefined' || typeof L === 'undefined') {
        alert('⚠️ Leaflet map not found on this page.');
        return;
    }

    function dmsToDecimal(dms) {
        let parts = dms.trim().match(/(\d+)[°º]?\s*(\d+)?['']?\s*([\d.]+)?[""]?\s*([NSEW])/i);
        if (!parts) return null;
        let deg = parseFloat(parts[1] || 0),
            min = parseFloat(parts[2] || 0),
            sec = parseFloat(parts[3] || 0);
        let dir = parts[4].toUpperCase();
        let dec = deg + (min / 60) + (sec / 3600);
        return /[SW]/.test(dir) ? -dec : dec;
    }

    // Primary: scan Remarks column (3rd td) for DMS coordinates
    let remarks = document.querySelectorAll('td:nth-child(3)');
    for (let td of remarks) {
        let text = td.innerText.replace(/\s+/g, ' ').trim();
        let match = text.match(/(\d{1,3}[°º]?\s*\d{1,2}['']?\s*[\d.]+[""]?\s*[NS])[,;\s]+(\d{1,3}[°º]?\s*\d{1,2}['']?\s*[\d.]+[""]?\s*[EW])/i);
        if (match) {
            let lat = dmsToDecimal(match[1]),
                lon = dmsToDecimal(match[2]);
            if (lat !== null && lon !== null) {
                map.setView([lat, lon], 15);
                alert(`📍 Map centered on:\n${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                return;
            }
        }
    }

    // Fallback: import first KMZ/KML found on the page
    let spans = document.querySelectorAll('span.text-primary');
    for (let span of spans) {
        let name = span.innerText.toLowerCase();
        if (name.endsWith('.kmz') || name.endsWith('.kml')) {
            let row = span.closest('tr');
            let dl = row && row.querySelector("a[href*='download'], a[download]");
            if (dl) {
                window.PHAST.importKML();
                return;
            }
        }
    }

    alert('⚠️ No coordinates or KMZ/KML files found.');
};

console.log('PHAST Map Handlers Injected');
