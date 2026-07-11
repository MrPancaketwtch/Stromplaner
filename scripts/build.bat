@echo off
cd /d "%~dp0.."
echo Stromplaner wird gebaut...
npm run build
if %errorlevel% equ 0 (
    echo.
    echo Fertig! "Das Tool\Stromplaner.html" ist aktualisiert.
) else (
    echo.
    echo Fehler beim Build. Ist Node.js installiert und wurde "npm install" ausgefuehrt?
)
pause
