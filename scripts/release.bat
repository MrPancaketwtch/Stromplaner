@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo ==============================
echo  Stromplaner Release
echo ==============================
echo.

echo Pruefe auf uncommitted Aenderungen...
git diff --quiet --exit-code
if !errorlevel! neq 0 (
    echo FEHLER: Es gibt uncommitted Aenderungen im Working Tree.
    git diff --stat
    pause & exit /b 1
)
git diff --cached --quiet --exit-code
if !errorlevel! neq 0 (
    echo FEHLER: Es gibt staged aber nicht committete Aenderungen.
    git diff --cached --stat
    pause & exit /b 1
)

echo.
set /p VERSION="Neue Version (z.B. 1.0.11): "
if "!VERSION!"=="" ( echo Keine Version angegeben. & pause & exit /b 1 )

echo.
echo Pruefe ob Tag v!VERSION! bereits existiert...
git rev-parse "refs/tags/v!VERSION!" >nul 2>&1
if !errorlevel! equ 0 (
    echo FEHLER: Tag v!VERSION! existiert bereits lokal.
    pause & exit /b 1
)
git ls-remote --exit-code --tags origin "refs/tags/v!VERSION!" >nul 2>&1
if !errorlevel! equ 0 (
    echo FEHLER: Tag v!VERSION! existiert bereits auf dem Remote.
    pause & exit /b 1
)

echo.
echo [1/5] package.json auf v!VERSION! setzen...
node -e "const fs=require('fs');const p='package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='!VERSION!';fs.writeFileSync(p,JSON.stringify(j,null,2),'utf8');"
if !errorlevel! neq 0 ( echo FEHLER beim Setzen der Version. & pause & exit /b 1 )

echo [2/5] App bauen...
call npm run build
if !errorlevel! neq 0 ( echo FEHLER: Build fehlgeschlagen. & pause & exit /b 1 )

echo [3/5] Commit...
git add package.json app/Stromplaner.html
git diff --cached --quiet --exit-code
if !errorlevel! neq 0 (
    git commit -m "chore: release v!VERSION!"
    if !errorlevel! neq 0 ( echo FEHLER: Commit fehlgeschlagen. & pause & exit /b 1 )
) else (
    echo   Keine Aenderungen zum Committen – bereits vorbereitet.
)

echo [4/5] Branch pushen...
git push
if !errorlevel! neq 0 ( echo FEHLER: Push fehlgeschlagen. & pause & exit /b 1 )

echo [5/5] Tag v!VERSION! erstellen und pushen...
git tag "v!VERSION!"
if !errorlevel! neq 0 ( echo FEHLER: Tag konnte nicht erstellt werden. & pause & exit /b 1 )
git push origin "v!VERSION!"
if !errorlevel! neq 0 ( echo FEHLER: Tag-Push fehlgeschlagen. & pause & exit /b 1 )

echo.
echo ==============================
echo  Fertig!
echo  GitHub Actions baut jetzt
echo  Windows + macOS automatisch.
echo.
echo  Actions:  https://github.com/MrPancaketwtch/Stromplaner/actions
echo  Releases: https://github.com/MrPancaketwtch/Stromplaner/releases
echo ==============================
echo.
pause
