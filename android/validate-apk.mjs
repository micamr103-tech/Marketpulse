/**
 * Validates the built APK without a device:
 *  • signature + manifest metadata
 *  • every asset the HTML references actually exists in the archive
 *  • the exact path the WebView would resolve for each one
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const APK = process.argv[2] || "C:\\Users\\Marko\\Desktop\\MarketPulse.apk";
const SDK = "C:\\apktool\\android-sdk";
const BT = `${SDK}\\build-tools\\34.0.0`;
const JDK = "C:\\apktool\\jdk\\jdk-17.0.20.1+1";

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", env: { ...process.env, JAVA_HOME: JDK } });
  } catch (e) {
    return `${e.stdout || ""}${e.stderr || ""}`;
  }
};

console.log("=== signature ===");
console.log(sh(`${BT}\\apksigner.bat`, ["verify", "--print-certs", APK]).trim().split("\n").slice(0, 3).join("\n"));

console.log("\n=== manifest ===");
const badging = sh(`${BT}\\aapt2.exe`, ["dump", "badging", APK]);
for (const line of badging.split("\n").filter((l) => /package:|sdkVersion|targetSdk|application-label:|launchable/.test(l)).slice(0, 5)) {
  console.log("  " + line.trim());
}

console.log("\n=== archive ===");
/* Parse the zip central directory (signature 0x02014b50). Scanning for local
   headers instead also matches those bytes inside compressed payloads, which
   produces phantom entries. */
const buf = readFileSync(APK);
const entries = new Map();
for (let i = 0; i < buf.length - 46; i++) {
  if (buf.readUInt32LE(i) !== 0x02014b50) continue;
  const method = buf.readUInt16LE(i + 10);
  const nameLen = buf.readUInt16LE(i + 28);
  const localOffset = buf.readUInt32LE(i + 42);
  const name = buf.toString("utf8", i + 46, i + 46 + nameLen);

  /* The payload offset has to come from the LOCAL header. Its extra field is
     not the same length as the central directory's (zipalign injects padding
     into the local one), so reading the central length here reports healthy
     archives as misaligned. */
  const localNameLen = buf.readUInt16LE(localOffset + 26);
  const localExtraLen = buf.readUInt16LE(localOffset + 28);

  entries.set(name, { method, localOffset, dataStart: localOffset + 30 + localNameLen + localExtraLen });
}
const names = new Set(entries.keys());
console.log(`  ${names.size} entries, ${(buf.length / 1048576).toFixed(1)} MB`);
console.log(`  backslash paths: ${[...names].filter((n) => n.includes("\\")).length}`);

/* The install-time landmine. Android 11+ rejects the package outright when
   these two are compressed or misaligned, and reports only "Failed parse
   during installPackageLI: ... -124" — which looks like a corrupt download
   and has nothing to do with one. */
console.log("\n=== installability ===");
let installFatal = 0;
for (const critical of ["resources.arsc", "AndroidManifest.xml"]) {
  const e = entries.get(critical);
  if (!e) {
    console.log(`  MISSING  ${critical}`);
    installFatal++;
    continue;
  }
  const stored = e.method === 0;
  const aligned = e.dataStart % 4 === 0;
  if (!stored || !aligned) installFatal++;
  console.log(
    `  ${stored && aligned ? "OK  " : "BAD "}  ${critical.padEnd(22)} ` +
      `${stored ? "stored" : `deflated(method ${e.method})`}, ` +
      `offset ${e.dataStart} ${aligned ? "4-byte aligned" : "MISALIGNED"}`
  );
}
// zipalign exits non-zero when an entry is misaligned, so trust the exit code.
// Its success message is also misspelled ("Verification succesful") in some
// locales, which makes matching on the text unreliable.
let aligned = true;
try {
  execFileSync(`${BT}\\zipalign.exe`, ["-c", "-v", "4", APK], { encoding: "utf8" });
} catch {
  aligned = false;
}
if (!aligned) installFatal++;
console.log(`  ${aligned ? "OK  " : "BAD "}  zipalign verification`);

/* The WebView resolves a request path like "/assets/x.js" by opening
   assets/x.js from the archive. Verify that for every asset the page loads.
   index.html is read from the build output, which is byte-for-byte what was
   packaged. */
const INDEX = "C:\\Users\\Marko\\marketpulse\\dist\\index.html";
if (!existsSync(INDEX)) {
  console.log("  dist/index.html not found — build the web app first");
  process.exit(1);
}
const indexHtml = readFileSync(INDEX, "utf8");

const refs = new Set();
for (const m of indexHtml.matchAll(/(?:src|href)="\/([^"]+)"/g)) refs.add(m[1]);
for (const m of indexHtml.matchAll(/"\/assets\/([^"]+\.(?:js|css|wasm|png|webmanifest))"/g)) refs.add("assets/" + m[1]);

console.log("\n=== referenced assets ===");
let missing = 0;
for (const ref of [...refs].sort()) {
  const apkPath = "assets/" + ref.replace(/^\//, "");
  const ok = names.has(apkPath);
  if (!ok) missing++;
  console.log(`  ${ok ? "OK  " : "MISS"} ${apkPath}`);
}

console.log(`\n${missing === 0 ? "PASS" : "FAIL"} — ${refs.size} referenced, ${missing} missing`);
console.log("sha256:", createHash("sha256").update(buf).digest("hex").slice(0, 32));
if (missing > 0 || installFatal > 0) process.exit(1);
