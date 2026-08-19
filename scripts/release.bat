@echo off
cd /d "%~dp0.."

echo ==============================
echo  Stromplaner Release
echo ==============================
echo.

echo Pruefe auf uncommitted Aenderungen...
git diff --quiet
if %errorlevel% neq 0 (
    echo FEHLER: Es gibt uncommitted Aenderungen im Working Tree.
    echo Bitte zuerst alles committen oder zuruecksetzen, dann neu starten.
    git diff --stat
    pause
    exit /b 1
)
git diff --cached --quiet
if %errorlevel% neq 0 (
    echo FEHLER: Es gibt staged aber nicht committete Aenderungen.
    echo Bitte zuerst committen, dann neu starten.
    git diff --cached --stat
    pause
    exit /b 1
)

echo.
set /p VERSION="Neue Version (z.B. 1.0.8): "

if "%VERSION%"=="" (
    echo Keine Version angegeben.
    pause
    exit /b 1
)

git tag v%VERSION% 2>nul
if %errorlevel% equ 0 (
    git tag -d v%VERSION%
) else (
    echo FEHLER: Tag v%VERSION% existiert bereits lokal oder auf dem Remote.
    echo Bitte eine hoehere Versionsnummer waehlen.
    pause
    exit /b 1
)
git ls-remote --exit-code --tags origin v%VERSION% >nul 2>&1
if %errorlevel% equ 0 (
    echo FEHLER: Tag v%VERSION% existiert bereits auf dem Remote.
    echo Bitte eine hoehere Versionsnummer waehlen.
    pause
    exit /b 1
)

echo.
echo [1/5] package.json auf v%VERSION% setzen...
node -e "const fs=require('fs');const p='package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='%VERSION%';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n','utf8');"
if %errorlevel% neq 0 ( echo Fehler beim Setzen der Version. & pause & exit /b 1 )

echo [2/5] App bauen...
npm run build
if %errorlevel% neq 0 ( echo Build fehlgeschlagen. & pause & exit /b 1 )

echo [3/5] Commit (falls noetig)...
git add package.json app/Stromplaner.html app/Stromplaner.jsx README.md
git diff --cached --quiet
if %errorlevel% neq 0 (
    git commit -m "chore: release v%VERSION%"
    if %errorlevel% neq 0 ( echo Commit fehlgeschlagen. & pause & exit /b 1 )
) else (
    echo   Keine Aenderungen zum Committen – bereits alles vorbereitet.
)

echo [4/5] Branch pushen...
git push
if %errorlevel% neq 0 ( echo Branch-Push fehlgeschlagen. & pause & exit /b 1 )

echo [5/5] Tag v%VERSION% erstellen und pushen...
git tag v%VERSION%
if %errorlevel% neq 0 ( echo Tag erstellen fehlgeschlagen. & pause & exit /b 1 )
git push origin v%VERSION%
if %errorlevel% neq 0 ( echo Tag-Push fehlgeschlagen. & pause & exit /b 1 )

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
