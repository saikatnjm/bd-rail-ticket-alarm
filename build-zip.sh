#!/usr/bin/env bash
# Builds two zips from shohoz-autobook/:
#   webstore/bd-rail-ticket-alarm-<version>.zip  Chrome Web Store upload (files at the root)
#   webstore/bd-rail-ticket-alarm.zip            GitHub Release download (one "bd-rail-ticket-alarm" folder)
set -euo pipefail
cd "$(dirname "$0")"
ver=$(python3 -c 'import json;print(json.load(open("shohoz-autobook/manifest.json"))["version"])')
store="webstore/bd-rail-ticket-alarm-$ver.zip"
install="webstore/bd-rail-ticket-alarm.zip"
rm -f "$store" "$install"
(cd shohoz-autobook && zip -q -X -r "../$store" . -x '*.md' -x '.*')
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/bd-rail-ticket-alarm"
root=$(pwd)
for f in shohoz-autobook/*; do cp -r "$f" "$stage/bd-rail-ticket-alarm/"; done
(cd "$stage" && zip -q -X -r "$root/$install" bd-rail-ticket-alarm)
echo "built $store"
echo "built $install"
unzip -l "$install" | tail -n 3
