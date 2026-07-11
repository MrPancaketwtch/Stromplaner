@echo off
echo Stromplaner App wird gebaut (JSX + Installer)...
npm run dist
if %errorlevel% equ 0 (
    echo.
    echo Fertig! Installer liegt in "dist\".
) else (
    echo.
    echo Fehler. Ist Node.js installiert und wurde "npm install" ausgefuehrt?
)
pause
