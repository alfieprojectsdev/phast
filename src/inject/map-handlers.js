// Map Handlers - Injected into MAIN world
// Access to 'map', 'L', 'drawnItems'

window.PHAT = window.PHAT || {};

// --- MAP OVERLAY LOGIC ---
// --- MAP OVERLAY LOGIC ---
window.PHAT.overlayVicinityMap = function () {
    console.log('PHAT: Overlaying Vicinity Map...');

    if (typeof map === 'undefined' || typeof L === 'undefined') {
        alert('⚠️ Leaflet map not found on this page.');
        return;
    }

    // Remove previous overlay if any
    if (window._vicinityOverlay) {
        map.removeLayer(window._vicinityOverlay);
        window._vicinityOverlay = null;
    }
    if (window._vicinityPanel) {
        window._vicinityPanel.remove();
        window._vicinityPanel = null;
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
        // Load Dependencies and Show Overlay
        loadDependencies()
            .then(() => {
                if (chosen.ext === '.pdf') {
                    renderPdf(chosen.url, chosen.name);
                } else {
                    fetch(chosen.url)
                        .then(res => res.blob())
                        .then(blob => showOverlay(URL.createObjectURL(blob), chosen.name))
                        .catch(err => alert('❌ Error loading image: ' + err.message));
                }
            })
            .catch(() => alert('⚠️ Could not load distortable image library.'));
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
                            <strong>${opt.name}</strong><br>
                            <small style="color: #666;">Uploaded: ${opt.date}</small>
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

            const repo = 'https://unpkg.com/leaflet-distortableimage@0.21.9';
            const cssFiles = ['vendor.css', 'leaflet.distortableimage.css'];

            // Load CSS
            cssFiles.forEach(file => {
                if (!document.querySelector(`link[href*="${file}"]`)) {
                    let css = document.createElement('link');
                    css.rel = 'stylesheet';
                    css.href = `${repo}/dist/${file}`;
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

            loadScript(`${repo}/dist/vendor.js`)
                .then(() => loadScript(`${repo}/dist/leaflet.distortableimage.js`))
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
    }

    function showOverlay(imageUrl, fileName) {
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
            map.doubleClickLabels.disable();
        }

        // Debug: Check actions
        if (!L.DragAction) console.error('L.DragAction missing');
        if (!L.ScaleAction) console.error('L.ScaleAction missing');

        const actions = [
            L.DragAction, L.ScaleAction, L.DistortAction, L.RotateAction,
            L.FreeRotateAction, L.LockAction, L.RestoreAction, L.DeleteAction
        ];

        let overlay = L.distortableImageOverlay(imageUrl, {
            corners: corners,
            actions: actions,
            mode: 'drag'
        });

        overlay.addTo(map);
        window._vicinityOverlay = overlay;

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
                    <b>Toolbar modes</b> (click image to show):<br>
                    Drag &bull; Scale &bull; Rotate &bull; Distort<br>
                    Use <b>Distort</b> to warp individual corners.
                </div>
                <button id="_vm_close" style="background:#e74c3c;color:white;border:none;border-radius:4px;padding:6px 16px;cursor:pointer;width:100%;">Remove Overlay</button>
            </div>
        `;
        map.getContainer().appendChild(panel);
        window._vicinityPanel = panel;

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

        panel.querySelector('#_vm_close').addEventListener('click', function () {
            map.removeLayer(overlay);
            panel.remove();
            window._vicinityOverlay = null;
            window._vicinityPanel = null;
        });
    }

    function renderPdf(url, name) {
        if (typeof pdfjsLib === 'undefined') {
            // Need to load PDF.js first if not loaded (simpler to rely on internal logic or add alert in V1)
            // But let's assume it's loaded by the main branch block for now or add a quick loader check
            let s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            s.onload = function () {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                renderPdf(url, name);
            };
            document.head.appendChild(s);
            return;
        }

        fetch(url)
            .then(res => res.arrayBuffer())
            .then(buf => pdfjsLib.getDocument({ data: buf }).promise)
            .then(pdf => pdf.getPage(1))
            .then(page => {
                let scale = 2;
                let viewport = page.getViewport({ scale: scale });
                let canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                let ctx = canvas.getContext('2d');
                return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(() => {
                    showOverlay(canvas.toDataURL('image/png'), name);
                });
            })
            .catch(err => alert('❌ Error rendering PDF: ' + err.message));
    }
};

// --- KML IMPORT LOGIC ---
// --- KML IMPORT LOGIC ---
window.PHAT.importKML = function () {
    console.log('PHAT: Importing KML...');
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
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
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
window.PHAT.checkULAP = function () {
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

console.log('PHAT Map Handlers Injected');
