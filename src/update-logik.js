// Reine Update-Logik für macOS (ohne Electron) – getestet in test/update-logik.test.js.
// Die Mac-App ist nur ad-hoc signiert; electron-updater/Squirrel.Mac installiert dort keine Updates.
// Stattdessen holt der Mac-Pfad die neueste Version über die GitHub-Releases-API.

// Semver-Vergleich mit Vorabversionen: 1.5.0-beta.2 < 1.5.0-beta.10 < 1.5.0 < 1.5.1
function zerlege(v) {
  const [kern, vor = ''] = String(v || '').trim().replace(/^v/, '').split('+')[0].split(/-(.*)/s);
  const zahlen = kern.split('.').map(n => parseInt(n, 10) || 0);
  while (zahlen.length < 3) zahlen.push(0);
  return { zahlen, vor: vor ? vor.split('.') : [] };
}

function vergleicheVersionen(a, b) {
  const x = zerlege(a), y = zerlege(b);
  for (let i = 0; i < 3; i++) if (x.zahlen[i] !== y.zahlen[i]) return x.zahlen[i] < y.zahlen[i] ? -1 : 1;
  // Ohne Vorab-Kennung ist eine Version neuer als jede ihrer Vorabversionen
  if (!x.vor.length || !y.vor.length) return x.vor.length === y.vor.length ? 0 : x.vor.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.vor.length, y.vor.length); i++) {
    const p = x.vor[i], q = y.vor[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pz = /^\d+$/.test(p), qz = /^\d+$/.test(q);
    if (pz && qz) { if (+p !== +q) return +p < +q ? -1 : 1; }
    else if (pz !== qz) return pz ? -1 : 1;
    else if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

const istVorabversion = (v) => zerlege(v).vor.length > 0;
const versionVon = (release) => String(release?.tag_name || '').replace(/^v/, '');

// Neueste Version aus der Liste der GitHub-API, die neuer als die installierte ist (oder null).
// beta=false: Vorabversionen (Tag mit Bindestrich oder als Pre-release markiert) bleiben außen vor.
function neuesteRelease(releases, { aktuell, beta = false } = {}) {
  let beste = null;
  for (const r of releases || []) {
    if (!r || r.draft) continue;
    const v = versionVon(r);
    if (!/^\d+\.\d+\.\d+/.test(v)) continue;
    if (!beta && (r.prerelease || istVorabversion(v))) continue;
    if (vergleicheVersionen(v, aktuell) <= 0) continue;
    if (!beste || vergleicheVersionen(v, versionVon(beste)) > 0) beste = r;
  }
  return beste;
}

// Passende DMG: Apple Silicon → „…-arm64.dmg“, Intel → die DMG ohne Architektur-Zusatz
function dmgAsset(assets, arch) {
  const dmgs = (assets || []).filter(a => /\.dmg$/i.test(a?.name || ''));
  const arm = (a) => /-arm64\.dmg$/i.test(a.name);
  return (arch === 'arm64' ? dmgs.find(arm) : dmgs.find(a => !arm(a))) || null;
}

// Stichpunkte unter „## Neu in …“ aus dem Text eines Releases
function notizenAus(body) {
  const zeilen = String(body || '').split(/\r?\n/);
  const start = zeilen.findIndex(z => /^##\s+Neu in\b/i.test(z.trim()));
  if (start < 0) return [];
  const notizen = [];
  for (const z of zeilen.slice(start + 1)) {
    if (/^#{1,6}\s/.test(z.trim())) break;
    const m = z.match(/^\s*[-*]\s+(.*\S)/);
    if (m) notizen.push(m[1]);
  }
  return notizen;
}

module.exports = { vergleicheVersionen, istVorabversion, versionVon, neuesteRelease, dmgAsset, notizenAus };
