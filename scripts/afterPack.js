const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function(context) {
  if (context.electronPlatformName === 'darwin') return adhocSignieren(context);
  if (context.electronPlatformName !== 'win32') return;

  const rcedit = path.join(context.packager.projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
  const exe = path.join(context.appOutDir, 'Stromplaner.exe');
  const ico = path.join(context.packager.projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(rcedit)) { console.log('rcedit nicht gefunden, Icon wird übersprungen'); return; }
  if (!fs.existsSync(ico))    { console.log('icon.ico nicht gefunden, Icon wird übersprungen'); return; }

  execFileSync(rcedit, [exe, '--set-icon', ico]);
  console.log('Icon in Stromplaner.exe eingebettet.');
};

// Ohne Apple-Zertifikat signiert electron-builder nicht. Das Packen verändert aber das Electron-Bundle
// (Name, Info.plist), dessen Signatur dadurch ungültig wird – Apple Silicon startet so etwas nicht
// („beschädigt“). Eine Ad-hoc-Signatur macht das Bundle wieder gültig.
function adhocSignieren(context) {
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`Ad-hoc signiert: ${app}`);
}
