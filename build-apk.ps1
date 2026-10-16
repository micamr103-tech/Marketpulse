#!/usr/bin/env pwsh
<#
  Builds a signed, sideloadable MarketPulse APK with the Android SDK build tools
  directly — no Gradle, no Android Studio.

  Run from anywhere:
      powershell -ExecutionPolicy Bypass -File android/build-apk.ps1

  Override the toolchain locations with -SdkRoot / -OutApk, or set the
  ANDROID_SDK and APK_OUT environment variables.
#>
param(
  [string]$SdkRoot  = $(if ($env:ANDROID_SDK) { $env:ANDROID_SDK } else { "C:\apktool" }),
  [string]$OutApk   = $(if ($env:APK_OUT)     { $env:APK_OUT     } else { Join-Path ([Environment]::GetFolderPath("Desktop")) "MarketPulse.apk" })
)

# Native tools (javac/d8/aapt2) write warnings to stderr; PowerShell would turn
# that into a terminating error under "Stop", so failures are detected by exit
# code instead.
$ErrorActionPreference = "Continue"

$ROOT   = Split-Path $PSScriptRoot -Parent
$SDK    = Join-Path $SdkRoot "android-sdk"
$BT     = "$SDK\build-tools\34.0.0"
$JDK    = (Get-ChildItem (Join-Path $SdkRoot "jdk") -Directory | Select-Object -First 1).FullName
$PROJ   = Join-Path $ROOT "android"
$WEB    = Join-Path $ROOT "dist"
$OUT    = Join-Path $SdkRoot "out"

if (-not (Test-Path $WEB)) {
  throw "No web build at $WEB — run 'npm run build' first."
}

$env:JAVA_HOME = $JDK
$env:PATH = "$JDK\bin;$BT;$env:PATH"

Remove-Item $OUT -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$OUT\classes", "$OUT\gen", "$OUT\dex" | Out-Null

Write-Host "1/7  staging the web build into assets/"
Remove-Item "$PROJ\assets" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$PROJ\assets" | Out-Null
Copy-Item "$WEB\*" "$PROJ\assets\" -Recurse -Force

Write-Host "2/7  aapt2 compile (resources)"
& "$BT\aapt2.exe" compile --dir "$PROJ\res" -o "$OUT\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Host "3/7  aapt2 link (manifest + resources + assets)"
& "$BT\aapt2.exe" link `
  -o "$OUT\base-unsigned.apk" `
  -I "$SDK\platforms\android-34\android.jar" `
  --manifest "$PROJ\AndroidManifest.xml" `
  -R "$OUT\res.zip" `
  -A "$PROJ\assets" `
  --java "$OUT\gen" `
  --min-sdk-version 26 `
  --target-sdk-version 34 `
  --version-code 3 `
  --version-name "2.0.0" `
  --auto-add-overlay `
  --no-version-vectors
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "4/7  javac (application)"
# Argument files must be written WITHOUT a byte-order mark, or javac rejects the
# first flag. PowerShell's `Set-Content -Encoding utf8` adds one.
$jar     = "$SDK\platforms\android-34\android.jar"
$sources = @(
  Get-ChildItem "$PROJ\java" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
  Get-ChildItem "$OUT\gen" -Recurse -Filter *.java -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
)
$javacArgs = @(
  "-nowarn", "-encoding", "UTF-8",
  "--class-path", $jar,
  "-d", "$OUT\classes"
) + $sources
[System.IO.File]::WriteAllLines("$OUT\javac.args", $javacArgs, (New-Object System.Text.UTF8Encoding($false)))

& "$JDK\bin\javac.exe" "@$OUT\javac.args" 2>&1 | Select-Object -First 12
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "5/7  d8 (classes -> dex)"
$classFiles = Get-ChildItem "$OUT\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName }
& "$BT\d8.bat" --lib "$SDK\platforms\android-34\android.jar" --min-api 26 --output "$OUT\dex" @classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Host "6/7  packaging + aligning"

# The archive is rebuilt by the JDK, not by .NET. Two Android-specific rules
# have to be honoured and .NET Framework cannot express the first one:
#
#   * aapt2 writes asset paths with the host separator ("assets\foo.js"), and
#     Android's asset manager only resolves forward slashes;
#   * API 30+ refuses to install unless resources.arsc and AndroidManifest.xml
#     are STORED and 4-byte aligned.
#
# PowerShell's ZipArchive silently compresses those two files even when asked
# for NoCompression, which is what made the first APK uninstallable. See
# android/tools/Pack.java.
$packSrc = "$OUT\pack"
New-Item -ItemType Directory -Force -Path $packSrc | Out-Null
$packArgs = @("-nowarn", "-d", $packSrc, "$PROJ\tools\Pack.java")
[System.IO.File]::WriteAllLines("$OUT\pack.args", $packArgs, (New-Object System.Text.UTF8Encoding($false)))
& "$JDK\bin\javac.exe" "@$OUT\pack.args" 2>&1 | Select-Object -First 6
if ($LASTEXITCODE -ne 0) { throw "Pack.java failed to compile" }

& "$JDK\bin\java.exe" -cp $packSrc Pack "$OUT\base-unsigned.apk" "$OUT\dex\classes.dex" "$OUT\packed.apk"
if ($LASTEXITCODE -ne 0) { throw "Pack failed" }

& "$BT\zipalign.exe" -f -p 4 "$OUT\packed.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "7/7  signing"
# The keystore is the APK signing identity. It must live OUTSIDE $OUT, which is
# wiped on every build — generating a fresh key per build silently makes every
# rebuild a *different app* as far as Android is concerned, and upgrading then
# fails with INSTALL_FAILED_UPDATE_INCOMPATIBLE unless you uninstall first.
#
# It is gitignored on purpose: whoever holds this file can sign an update that
# Android will install over the app. Back it up somewhere private instead of
# committing it.
$KS_PASS  = $(if ($env:KEYSTORE_PASS) { $env:KEYSTORE_PASS } else { "marketpulse" })
$keystore = "$PROJ\marketpulse.keystore"
if (-not (Test-Path $keystore)) {
  Write-Host "     creating a signing key (keep android\marketpulse.keystore)"
  & "$JDK\bin\keytool.exe" -genkeypair -v `
    -keystore $keystore -storepass $KS_PASS -keypass $KS_PASS `
    -alias marketpulse -keyalg RSA -keysize 2048 -validity 10950 `
    -dname "CN=MarketPulse, OU=App, O=MarketPulse, L=, ST=, C=US" | Out-Null
}

& "$BT\apksigner.bat" sign `
  --ks $keystore --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" `
  --ks-key-alias marketpulse `
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --min-sdk-version 21 `
  --out $OutApk `
  "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

& "$BT\apksigner.bat" verify --print-certs $OutApk | Select-Object -First 3

$apk = Get-Item $OutApk
Write-Host ""
Write-Host "APK built: $($apk.FullName)  ($([math]::Round($apk.Length/1MB,1)) MB)"
