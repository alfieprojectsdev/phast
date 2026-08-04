#!/usr/bin/env bash
# Re-download the vendored third-party libraries and rewrite SHA256SUMS.
#
# Run only when bumping a version — the downloaded files are committed, and
# PHAST loads them from the extension origin rather than a CDN (see README.md).
# Requires egress; run it on a machine that has some.
set -euo pipefail

cd "$(dirname "$0")"

LDI_VERSION=0.21.9
PDFJS_VERSION=3.11.174
JSZIP_VERSION=3.10.1

ldi="https://unpkg.com/leaflet-distortableimage@${LDI_VERSION}/dist"
pdfjs="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}"
jszip="https://cdnjs.cloudflare.com/ajax/libs/jszip/${JSZIP_VERSION}"

mkdir -p leaflet-distortableimage pdfjs jszip

for f in vendor.js leaflet.distortableimage.js vendor.css leaflet.distortableimage.css; do
    curl -fsSL "$ldi/$f" -o "leaflet-distortableimage/$f"
done
curl -fsSL "$pdfjs/pdf.min.js"        -o pdfjs/pdf.min.js
curl -fsSL "$pdfjs/pdf.worker.min.js" -o pdfjs/pdf.worker.min.js
curl -fsSL "$jszip/jszip.min.js"      -o jszip/jszip.min.js

sha256sum \
    leaflet-distortableimage/vendor.js \
    leaflet-distortableimage/leaflet.distortableimage.js \
    leaflet-distortableimage/vendor.css \
    leaflet-distortableimage/leaflet.distortableimage.css \
    pdfjs/pdf.min.js \
    pdfjs/pdf.worker.min.js \
    jszip/jszip.min.js \
    > SHA256SUMS

echo "Refreshed. Update the version table in README.md if any version changed."
sha256sum -c SHA256SUMS
