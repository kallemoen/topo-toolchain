#!/usr/bin/env bash
# Re-vendor the Topo parser/model from genflow into the toolchain (CLI core +
# viewer). Run this whenever genflow's src/lib/topos.ts changes. The serializer
# (src/core/serialize.ts) is toolchain-owned and is NOT overwritten.
#
# WARNING: the toolchain parser has diverged from genflow — it adds the `code`
# declaration (codePaths on ToposSystem, the string-literal tokenizer, and the
# `code` branch in parseBody). Running this CLOBBERS those additions; re-apply the
# `code` grammar to src/core/topos.ts and viewer/src/lib/topos.ts afterward.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$DIR/../genflow/src/lib/topos.ts"
if [ ! -f "$SRC" ]; then
  echo "sync-core: genflow source not found at $SRC" >&2
  exit 1
fi
cp "$SRC" "$DIR/src/core/topos.ts"
cp "$SRC" "$DIR/viewer/src/lib/topos.ts"
echo "synced topos.ts → src/core/topos.ts and viewer/src/lib/topos.ts"
