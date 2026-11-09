const test = require('node:test');
const assert = require('node:assert/strict');
const { vergleicheVersionen, neuesteRelease, dmgAsset, notizenAus } = require('../src/update-logik.js');

test('Versionsvergleich nach Semver', () => {
  const sortiert = ['1.3.0-beta.1', '1.3.0-beta.2', '1.3.0-beta.10', '1.3.0', '1.3.1', '1.4.0', '1.10.0'];
  for (let i = 0; i < sortiert.length - 1; i++) {
    assert.equal(vergleicheVersionen(sortiert[i], sortiert[i + 1]), -1, `${sortiert[i]} < ${sortiert[i + 1]}`);
    assert.equal(vergleicheVersionen(sortiert[i + 1], sortiert[i]), 1, `${sortiert[i + 1]} > ${sortiert[i]}`);
  }
  assert.equal(vergleicheVersionen('v1.5.0', '1.5.0'), 0);
  assert.equal(vergleicheVersionen('1.5.0-alpha', '1.5.0-beta'), -1);
  assert.equal(vergleicheVersionen('1.5.0-beta', '1.5.0-beta.1'), -1);
});

const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: tag.includes('-'), assets: [], body: '', ...extra });
const liste = [rel('v1.6.0-beta.1'), rel('v1.5.0'), rel('v1.4.0'), rel('v1.7.0', { draft: true }), rel('v1.3.0-beta.2')];

test('Stabil: neueste fertige Version, Betas und Entwürfe ausgelassen', () => {
  assert.equal(neuesteRelease(liste, { aktuell: '1.4.0' }).tag_name, 'v1.5.0');
  assert.equal(neuesteRelease(liste, { aktuell: '1.5.0' }), null);
});

test('Beta: Vorabversionen eingeschlossen', () => {
  assert.equal(neuesteRelease(liste, { aktuell: '1.5.0', beta: true }).tag_name, 'v1.6.0-beta.1');
  assert.equal(neuesteRelease(liste, { aktuell: '1.6.0-beta.1', beta: true }), null);
});

test('Installierte Beta: fertige Version ist neuer, ältere nie', () => {
  assert.equal(neuesteRelease([rel('v1.6.0'), rel('v1.5.0')], { aktuell: '1.6.0-beta.1' }).tag_name, 'v1.6.0');
  assert.equal(neuesteRelease([rel('v1.5.0')], { aktuell: '1.6.0-beta.1' }), null);
});

test('Als Pre-release markierte Version zählt auch ohne Bindestrich als Beta', () => {
  assert.equal(neuesteRelease([rel('v1.6.0', { prerelease: true })], { aktuell: '1.5.0' }), null);
});

test('DMG je Architektur', () => {
  const assets = ['latest-mac.yml', 'Stromplaner-1.5.0-arm64.dmg.blockmap', 'Stromplaner-1.5.0-arm64.dmg',
    'Stromplaner-1.5.0.dmg.blockmap', 'Stromplaner-1.5.0.dmg', 'Stromplaner-Setup-1.5.0.exe'].map(name => ({ name }));
  assert.equal(dmgAsset(assets, 'arm64').name, 'Stromplaner-1.5.0-arm64.dmg');
  assert.equal(dmgAsset(assets, 'x64').name, 'Stromplaner-1.5.0.dmg');
  assert.equal(dmgAsset([{ name: 'Stromplaner-1.5.0.dmg' }], 'arm64'), null);
  assert.equal(dmgAsset([], 'x64'), null);
});

test('Notizen aus dem Release-Text', () => {
  const body = '## Neu in 1.5.0\n\n- Erstes\n- Zweites mit **fett**\n\n## Herunterladen\n\n- nicht das';
  assert.deepEqual(notizenAus(body), ['Erstes', 'Zweites mit **fett**']);
  assert.deepEqual(notizenAus('## Herunterladen\n- x'), []);
});

// Echte Releases auf GitHub – nur mit UPDATE_NETZTEST=1 (im Workflow „macOS Test-Build“)
test('GitHub-Releases: DMGs der neuesten Version gefunden', { skip: !process.env.UPDATE_NETZTEST }, async () => {
  const res = await fetch('https://api.github.com/repos/MrPancaketwtch/Stromplaner/releases?per_page=30', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Stromplaner-Updater-Test' },
  });
  assert.equal(res.status, 200);
  const r = neuesteRelease(await res.json(), { aktuell: '0.0.1' });
  assert.ok(r, 'keine fertige Version gefunden');
  assert.ok(dmgAsset(r.assets, 'arm64'), `keine arm64-DMG in ${r.tag_name}`);
  assert.ok(dmgAsset(r.assets, 'x64'), `keine Intel-DMG in ${r.tag_name}`);
});
