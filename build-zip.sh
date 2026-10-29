#!/usr/bin/env bash
# Builds the Chrome Web Store upload: webstore/bd-rail-ticket-alarm-<version>.zip
set -euo pipefail
cd "$(dirname "$0")"
ver=$(python3 -c 'import json;print(json.load(open("shohoz-autobook/manifest.json"))["version"])')
out="webstore/bd-rail-ticket-alarm-$ver.zip"
rm -f "$out"
(cd shohoz-autobook && zip -q -X -r "../$out" . -x '*.md' -x '.*')
echo "built $out"
unzip -l "$out"
