# Richtet die Android-Signierung ein: erzeugt einen Keystore und hinterlegt ihn als GitHub-Secrets.
# Aufruf: powershell -ExecutionPolicy Bypass -File scripts\setup-android-signing.ps1
$ErrorActionPreference = 'Stop'
$Repo     = 'MrPancaketwtch/Stromplaner'
$Alias    = 'stromplaner'
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host ''
Write-Host '== Stromplaner: Android-Signierschluessel einrichten ==' -ForegroundColor Yellow
Write-Host ''

function Find-Keytool {
  $cmd = Get-Command keytool -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $found = Get-ChildItem @(
    "$env:ProgramFiles\Eclipse Adoptium\*\bin\keytool.exe",
    "$env:ProgramFiles\Microsoft\jdk-*\bin\keytool.exe",
    "$env:ProgramFiles\Java\*\bin\keytool.exe",
    "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe"
  ) -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { return $found.FullName }
  return $null
}

function Read-Secret([string]$prompt) {
  $s = Read-Host $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

# -- 1. keytool (Java) --------------------------------------------------------
$keytool = Find-Keytool
if (-not $keytool) {
  $a = Read-Host 'Java (keytool) fehlt. Jetzt Eclipse Temurin 17 per winget installieren? [j/N]'
  if ($a -notmatch '^[jJyY]') { throw 'Abgebrochen - ohne Java gibt es kein keytool.' }
  winget install --id EclipseAdoptium.Temurin.17.JDK -e
  $keytool = Find-Keytool
  if (-not $keytool) { throw 'keytool nach der Installation nicht gefunden. Terminal neu oeffnen und Skript erneut starten.' }
}
Write-Host "keytool: $keytool" -ForegroundColor DarkGray

# -- 2. Ablageort (ausserhalb des Repos!) -------------------------------------
$defaultDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Stromplaner-Android'
$dir = Read-Host "Ordner fuer den Schluessel [$defaultDir]"
if (-not $dir) { $dir = $defaultDir }
$dir = [IO.Path]::GetFullPath($dir)
if ($dir.StartsWith($RepoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Bitte einen Ordner ausserhalb des Projekts waehlen - der Schluessel darf nie committet werden.'
}
New-Item -ItemType Directory -Force $dir | Out-Null
$ks = Join-Path $dir 'stromplaner-release.keystore'

# -- 3. Schluessel erzeugen oder vorhandenen verwenden -------------------------
$pw = $null
try {
  if (Test-Path $ks) {
    Write-Host "Es gibt bereits einen Schluessel: $ks" -ForegroundColor Cyan
    $a = Read-Host 'Diesen Schluessel verwenden und nur die GitHub-Secrets neu setzen? [J/n]'
    if ($a -match '^[nN]') { throw 'Abgebrochen - vorhandenen Schluessel bitte nicht ueberschreiben, sondern erst wegsichern.' }
    $pw = Read-Secret 'Passwort des Schluessels'
    $env:SP_KS_PASS = $pw
    & $keytool -list -keystore $ks -storepass:env SP_KS_PASS -alias $Alias | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Passwort falsch oder Alias nicht gefunden.' }
  } else {
    while ($true) {
      $pw  = Read-Secret 'Neues Passwort fuer den Schluessel (mind. 6 Zeichen)'
      $pw2 = Read-Secret 'Passwort wiederholen'
      if ($pw.Length -lt 6)   { Write-Host 'Zu kurz.' -ForegroundColor Red; continue }
      if ($pw -cne $pw2)      { Write-Host 'Passwoerter stimmen nicht ueberein.' -ForegroundColor Red; continue }
      break
    }
    $pw2 = $null
    $env:SP_KS_PASS = $pw
    & $keytool -genkeypair -keystore $ks -storetype PKCS12 -alias $Alias `
      -keyalg RSA -keysize 4096 -validity 10000 `
      -dname 'CN=Stromplaner, O=Stromplaner, C=DE' `
      -storepass:env SP_KS_PASS -keypass:env SP_KS_PASS
    if ($LASTEXITCODE -ne 0) { throw 'keytool ist fehlgeschlagen.' }
    Write-Host "Schluessel erzeugt: $ks" -ForegroundColor Green
  }

  # -- 4. GitHub-Secrets ------------------------------------------------------
  $secrets = [ordered]@{
    ANDROID_KEYSTORE_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($ks))
    ANDROID_KEY_ALIAS       = $Alias
    ANDROID_KEY_PASSWORD    = $pw
    ANDROID_STORE_PASSWORD  = $pw
  }

  $viaGh = $false
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh auth status *> $null
    if ($LASTEXITCODE -eq 0) {
      $viaGh = $true
      foreach ($name in $secrets.Keys) {
        gh secret set $name --repo $Repo --body $secrets[$name] *> $null
        if ($LASTEXITCODE -ne 0) { $viaGh = $false; break }
        Write-Host "Secret gesetzt: $name" -ForegroundColor Green
      }
      if (-not $viaGh) { Write-Host 'gh darf keine Secrets setzen - weiter per Hand ueber die Webseite.' -ForegroundColor Yellow }
    }
  }

  if (-not $viaGh) {
    Write-Host ''
    Write-Host 'Die Secrets werden jetzt einzeln in die Zwischenablage gelegt.' -ForegroundColor Cyan
    Write-Host 'Auf der GitHub-Seite jeweils "New repository secret" -> Name eintippen -> Wert mit Strg+V einfuegen -> "Add secret".'
    Start-Process "https://github.com/$Repo/settings/secrets/actions"
    foreach ($name in $secrets.Keys) {
      Set-Clipboard -Value $secrets[$name]
      Read-Host "Secret $name liegt in der Zwischenablage. Anlegen und dann Enter druecken"
    }
    Set-Clipboard -Value ' '
    Write-Host 'Zwischenablage geleert.' -ForegroundColor DarkGray
  }
}
finally {
  Remove-Item Env:SP_KS_PASS -ErrorAction SilentlyContinue
  $pw = $null; $secrets = $null
}

Write-Host ''
Write-Host 'Fertig. WICHTIG:' -ForegroundColor Yellow
Write-Host "  1. Die Datei $ks und das Passwort sicher aufbewahren (z. B. im Passwort-Manager)."
Write-Host '     Geht eins davon verloren, lassen sich Updates nicht mehr ueber die installierte App installieren.'
Write-Host '  2. Die Datei niemals ins Projekt kopieren oder committen.'
Write-Host '  3. Naechster APK-Build (Release oder Workflow "Android APK") ist signiert.'
Write-Host '     Einmalig die alte Debug-App deinstallieren, danach funktionieren Updates ohne Datenverlust.'
Write-Host ''
