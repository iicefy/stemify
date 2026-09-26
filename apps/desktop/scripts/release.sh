#!/usr/bin/env bash
# One command to ship a version: bump, build Mac + Windows, publish to GitHub.
#   scripts/release.sh <version> [notes-file]
# Installed apps find the release through the assets uploaded here:
#   update.json + *-update.zip  (Mac, small update)   latest.yml + .exe + .blockmap  (Windows)
set -euo pipefail
cd "$(dirname "$0")/../../.."   # repo root

VERSION="${1:?usage: release.sh <version> [notes-file]}"
NOTES_FILE="${2:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 1; }
command -v gh >/dev/null || { echo "install the GitHub CLI first: brew install gh" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login" >&2; exit 1; }

if ! git diff --quiet HEAD -- . ':!data' || [ -n "$(git ls-files --others --exclude-standard -- . ':!data')" ]; then
  echo "Commit or stash your changes first - the release is built from a clean tree." >&2
  exit 1
fi
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "release from the main branch" >&2; exit 1; }
git fetch origin main -q
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "main isn't in sync with origin/main - pull/push first" >&2; exit 1; }
gh release view "v$VERSION" >/dev/null 2>&1 && { echo "v$VERSION already exists" >&2; exit 1; }

echo "== Checking (typecheck, lint, tests)"
npm run check

echo "== Releasing $VERSION"
node -e "const f='apps/desktop/package.json',p=require('./'+f);p.version='$VERSION';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"

npm run build --workspace=apps/web
cd apps/desktop
node scripts/bundle.mjs
bash scripts/prepare-python.sh mac
bash scripts/prepare-python.sh win
node scripts/base-id.mjs
rm -rf release/*.dmg release/*.exe release/*.zip release/*.blockmap release/*.yml release/update.json
npx electron-builder --mac --arm64
npx electron-builder --win nsis --x64
node scripts/make-update.mjs
cd ../..

if [ -n "$NOTES_FILE" ]; then NOTES=(--notes-file "$NOTES_FILE"); else NOTES=(--generate-notes); fi

git add apps/desktop/package.json
git commit -q -m "chore: release v$VERSION"
git push origin main -q

R=apps/desktop/release
gh release create "v$VERSION" \
  "$R/Stemify-$VERSION-arm64.dmg" \
  "$R/Stemify-Setup-$VERSION-x64.exe" "$R/Stemify-Setup-$VERSION-x64.exe.blockmap" "$R/latest.yml" \
  "$R/Stemify-$VERSION-mac-arm64-update.zip" "$R/update.json" \
  --target main --latest --title "Stemify $VERSION" "${NOTES[@]}"
echo "== Published v$VERSION"
