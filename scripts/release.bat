@echo off
cd /d "%~dp0.."

echo ==============================
echo  Stromplaner Release
echo ==============================
echo.

set /p VERSION="Neue Version (z.B. 1.0.7): "

if "%VERSION%"=="" (
    echo Keine Version angegeben.
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

echo [3/5] Commit...
git add package.json app/Stromplaner.html app/Stromplaner.jsx README.md
git commit -m "chore: release v%VERSION%"
if %errorlevel% neq 0 ( echo Commit fehlgeschlagen. & pause & exit /b 1 )

echo [4/5] Branch pushen...
git push
if %errorlevel% neq 0 ( echo Branch-Push fehlgeschlagen. & pause & exit /b 1 )

echo [5/5] Tag v%VERSION% erstellen und pushen...
git tag v%VERSION%
if %errorlevel% neq 0 ( echo Tag erstellen fehlgeschlagen ^(existiert der Tag bereits?^). & pause & exit /b 1 )
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
