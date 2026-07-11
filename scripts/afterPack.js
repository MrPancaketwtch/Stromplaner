const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function(context) {
  if (context.electronPlatformName !== 'win32') return;

  const rcedit = path.join(context.packager.projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
  const exe = path.join(context.appOutDir, 'Stromplaner.exe');
  const ico = path.join(context.packager.projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(rcedit)) { console.log('rcedit nicht gefunden, Icon wird übersprungen'); return; }
  if (!fs.existsSync(ico))    { console.log('icon.ico nicht gefunden, Icon wird übersprungen'); return; }

  execFileSync(rcedit, [exe, '--set-icon', ico]);
  console.log('Icon in Stromplaner.exe eingebettet.');
};
