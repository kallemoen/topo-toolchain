#!/usr/bin/env bash
# Build the self-contained viewer and copy its bundle into the CLI's assets,
# so `topo view` can static-serve it with no React/Vite runtime dependency.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR/viewer"
[ -d node_modules ] || npm install
npm run build
rm -rf "$DIR/src/assets/viewer-dist"
cp -r dist "$DIR/src/assets/viewer-dist"
echo "viewer built → src/assets/viewer-dist"
