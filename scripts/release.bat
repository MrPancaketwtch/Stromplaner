@echo off
cd /d "%~dp0.."
echo Stromplaner Release bauen und auf GitHub veroeffentlichen...
echo.

if "%GH_TOKEN%"=="" (
    echo FEHLER: GH_TOKEN ist nicht gesetzt.
    echo.
    echo Bitte als Umgebungsvariable setzen:
    echo   Systemsteuerung ^> Umgebungsvariablen ^> GH_TOKEN
    echo.
    echo Token erstellen: GitHub ^> Settings ^> Developer settings ^> Personal access tokens
    echo Benoetigt: Scope "repo"
    echo.
    pause
    exit /b 1
)

npm run release
if %errorlevel% equ 0 (
    echo.
    echo Fertig! Release auf GitHub veroeffentlicht.
    echo https://github.com/MrPancaketwtch/Stromplaner/releases
) else (
    echo.
    echo Fehler beim Veroeffentlichen.
)
pause
