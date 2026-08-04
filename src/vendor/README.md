# Vendored third-party libraries

These are committed, not fetched at runtime. PHAST runs on the PHIVOLCS LAN,
which may have no egress to unpkg or cdnjs; a CDN `<script>` tag there does not
degrade gracefully — it hangs the action until the browser's own timeout fires,
long after the assessor has concluded the tool is broken.

`map-handlers.js` loads these from `window.PHAST.extBase` (the extension's own
`chrome-extension://` origin, derived from its `document.currentScript.src`).
Every path here must also be reachable through `web_accessible_resources` in
`manifest.json`, which lists `src/vendor/*`.

## Contents

| Path | Version | Upstream |
|---|---|---|
| `leaflet-distortableimage/` | 0.21.9 | `https://unpkg.com/leaflet-distortableimage@0.21.9/dist/` |
| `pdfjs/` | 3.11.174 | `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/` |
| `jszip/` | 3.10.1 | `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/` |

## Fixity

Verify with `sha256sum -c SHA256SUMS` from this directory. Refresh (and rewrite
the sums) with `./refresh.sh` — run it only when bumping a version, and commit
the result.

## Known residual remote references

`leaflet.distortableimage.js` embeds two URLs that are **not** fetched on load
and so do not affect a no-egress LAN:

- `export.mapknitter.org` — only reached if the overlay's *Export* toolbar
  action is used. PHAST does not expose it.
- `mt0.google.com/vt/lyrs=s` — a satellite tile template inside the
  MapKnitter-derived export helper, on the same unused path.

Neither was removed, to keep the vendored files byte-identical to upstream and
the fixity check meaningful.
