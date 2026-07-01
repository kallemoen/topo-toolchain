#!/usr/bin/env bash
# Bundle the CLI to a single zero-dependency JS file so installs need no `tsx`,
# no `esbuild`, and no native postinstall. The output (dist/) is committed and is
# the only thing shipped (see package.json "files"), so `npm i -g github:...`
# and `npx github:...` are just a file copy — they work in restricted sandboxes.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# Banner: the shebang (line 1) + a real `require` so bundled CJS deps that call
# require('node:...') work in the ESM output (esbuild's "Dynamic require" fix).
BANNER='#!/usr/bin/env node
import { createRequire as __topoCreateRequire } from "node:module";
const require = __topoCreateRequire(import.meta.url);'

npx esbuild src/cli/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --external:fsevents \
  --banner:js="$BANNER" \
  --outfile=dist/topo.mjs

rm -rf dist/assets
cp -r src/assets dist/assets
chmod +x dist/topo.mjs

echo "built dist/topo.mjs ($(wc -c < dist/topo.mjs | tr -d ' ') bytes) + dist/assets"
