// Builds the small macOS update package from the packaged app, and the
// update.json manifest that installed apps read. Run after electron-builder.
//   node scripts/make-update.mjs [notesFile]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const { base } = JSON.parse(fs.readFileSync(path.join(root, "build", "base.json"), "utf8"));
const release = path.join(root, "release");
const app = path.join(release, "mac-arm64", "Stemify.app");
if (!fs.existsSync(app)) throw new Error(`Build the Mac app first (missing ${app})`);

// The app's own version must match what's being released.
const plist = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(app, "Contents", "Info.plist")]).toString().trim();
if (plist !== pkg.version) throw new Error(`The built app is ${plist} but package.json says ${pkg.version} - rebuild first`);

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "stemify-update-"));
const res = path.join(stage, "Contents", "Resources");
fs.mkdirSync(res, { recursive: true });
fs.copyFileSync(path.join(app, "Contents", "Info.plist"), path.join(stage, "Contents", "Info.plist"));
for (const name of ["app.asar", "web", "worker"]) {
  fs.cpSync(path.join(app, "Contents", "Resources", name), path.join(res, name), { recursive: true });
}

const file = `Stemify-${pkg.version}-mac-arm64-update.zip`;
const zip = path.join(release, file);
fs.rmSync(zip, { force: true });
execFileSync("/usr/bin/ditto", ["-c", "-k", "--norsrc", "--noextattr", "--noqtn", stage, zip]);
fs.rmSync(stage, { recursive: true, force: true });

const bytes = fs.readFileSync(zip);
const manifest = {
  version: pkg.version,
  base,
  mac: { arm64: { file, sha512: createHash("sha512").update(bytes).digest("hex"), size: bytes.length } },
};
fs.writeFileSync(path.join(release, "update.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`[update] ${file} (${(bytes.length / 1e6).toFixed(2)} MB), base ${base}`);
