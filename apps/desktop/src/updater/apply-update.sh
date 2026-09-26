#!/bin/sh
# usage: apply-update.sh <pid> <bundle> <stage> <backup> [app args...]
PID="$1"; BUNDLE="$2"; STAGE="$3"; BACKUP="$4"; shift 4
R="$BUNDLE/Contents/Resources"

# Wait for the running app to exit; never touch a running app.
i=0
while kill -0 "$PID" 2>/dev/null; do
  i=$((i + 1)); [ "$i" -gt 100 ] && { echo "app did not quit; aborting"; exit 1; }
  sleep 0.3
done

restore() {
  echo "swap failed; restoring the previous version"
  rm -rf "$R/app.asar" "$R/web" "$R/worker"
  cp -R "$BACKUP/app.asar" "$BACKUP/web" "$BACKUP/worker" "$R/"
  cp "$BACKUP/Info.plist" "$BUNDLE/Contents/Info.plist"
}

rm -rf "$BACKUP"; mkdir -p "$BACKUP" || exit 1
cp -R "$R/app.asar" "$R/web" "$R/worker" "$BACKUP/" && cp "$BUNDLE/Contents/Info.plist" "$BACKUP/Info.plist" || { echo "backup failed"; exit 1; }

if rm -rf "$R/app.asar" "$R/web" "$R/worker" \
   && cp -R "$STAGE/Contents/Resources/app.asar" "$STAGE/Contents/Resources/web" "$STAGE/Contents/Resources/worker" "$R/" \
   && cp "$STAGE/Contents/Info.plist" "$BUNDLE/Contents/Info.plist"; then
  echo "updated"
else
  restore
fi

# Under test the app is started directly so its flags and environment carry over.
if [ -n "$STEMIFY_UPDATE_URL" ]; then
  "$BUNDLE/Contents/MacOS/Stemify" "$@" >/dev/null 2>&1 &
else
  open "$BUNDLE"
fi
