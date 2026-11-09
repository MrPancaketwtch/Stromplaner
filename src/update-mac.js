// Updates auf dem Mac: neueste Version über die GitHub-Releases-API suchen, die passende DMG nach
// ~/Downloads laden und öffnen. Austauschen muss man die App selbst (in „Programme“ ziehen) –
// automatisch installieren geht nur mit Apple-Developer-ID, die App ist aber nur ad-hoc signiert.
const { app, net, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { neuesteRelease, dmgAsset, notizenAus, versionVon, istVorabversion } = require('./update-logik.js');

const API = 'https://api.github.com/repos/MrPancaketwtch/Stromplaner/releases?per_page=30';
const ERINNERN_NACH_MS = 24 * 60 * 60 * 1000;

// Apple Silicon auch dann erkennen, wenn die Intel-Version unter Rosetta läuft
const architektur = () => (process.arch === 'arm64' || app.runningUnderARM64Translation ? 'arm64' : 'x64');

// send(type, payload) – wie beim electron-updater; einstellungen() / speichern(patch) – update-settings.json
function macUpdater({ send, kanal, einstellungen, speichern }) {
  let gefunden = null;   // { version, asset }
  let geladen = null;    // Pfad der geladenen DMG
  let laeuft = false;

  async function pruefen({ automatisch = false } = {}) {
    if (laeuft) return;
    if (geladen) { send('downloaded', { version: gefunden.version, manual: true, pfad: geladen }); return; }
    send('checking');
    try {
      const res = await net.fetch(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Stromplaner-Updater' } });
      if (!res.ok) throw new Error(`GitHub antwortet mit ${res.status}`);
      const release = neuesteRelease(await res.json(), { aktuell: app.getVersion(), beta: kanal() === 'beta' });
      const asset = release && dmgAsset(release.assets, architektur());
      if (!release || !asset) { gefunden = null; send('up-to-date'); return; }
      const version = versionVon(release);
      gefunden = { version, asset };
      const e = einstellungen();
      // Beim Start nicht melden, wenn übersprungen; „Später“ nur den Dialog unterdrücken
      if (automatisch && e.uebersprungen === version) { send('idle'); return; }
      const zeigen = automatisch && !(e.erinnernAb > Date.now());
      send('available', {
        version, manual: true, beta: istVorabversion(version), zeigen,
        notizen: notizenAus(release.body), groesse: asset.size || null,
      });
    } catch (err) {
      console.error('Mac-Update:', err?.message || err);
      send('error', { message: err?.message || String(err) });
    }
  }

  async function herunterladen() {
    if (!gefunden || laeuft) return;
    if (geladen) { shell.openPath(geladen); return; }
    laeuft = true;
    const ziel = path.join(app.getPath('downloads'), gefunden.asset.name);
    const teil = ziel + '.part';
    try {
      send('downloading', { percent: 0 });
      const res = await net.fetch(gefunden.asset.browser_download_url);
      if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status})`);
      const gesamt = Number(res.headers.get('content-length')) || gefunden.asset.size || 0;
      const datei = fs.createWriteStream(teil);
      let bytes = 0, zuletzt = -1;
      const leser = res.body.getReader();
      for (;;) {
        const { done, value } = await leser.read();
        if (done) break;
        if (!datei.write(Buffer.from(value))) await new Promise(ok => datei.once('drain', ok));
        bytes += value.length;
        const prozent = gesamt ? Math.floor(bytes / gesamt * 100) : null;
        if (prozent !== zuletzt) { zuletzt = prozent; send('downloading', { percent: prozent }); }
      }
      await new Promise((ok, fehler) => datei.end(err => (err ? fehler(err) : ok())));
      if (gesamt && bytes !== gesamt) throw new Error('Download unvollständig');
      fs.renameSync(teil, ziel);
      // Ohne Quarantäne-Kennung fragt Gatekeeper beim Start der neuen Version nicht nach
      await new Promise(ok => execFile('xattr', ['-d', 'com.apple.quarantine', ziel], () => ok()));
      geladen = ziel;
      speichern({ uebersprungen: null, erinnernAb: null });
      send('downloaded', { version: gefunden.version, manual: true, pfad: ziel });
      shell.openPath(ziel);
    } catch (err) {
      try { fs.unlinkSync(teil); } catch {}
      console.error('Mac-Update:', err?.message || err);
      send('error', { message: err?.message || String(err) });
    } finally {
      laeuft = false;
    }
  }

  return {
    pruefen,
    // Ist die DMG geladen, beendet „Installieren“ die App, damit man sie in „Programme“ ersetzen kann
    installieren: () => (geladen ? app.quit() : herunterladen()),
    imFinderZeigen: () => { if (geladen) shell.showItemInFolder(geladen); },
    ueberspringen: () => { if (gefunden) { speichern({ uebersprungen: gefunden.version }); send('idle'); } },
    spaeter: () => speichern({ erinnernAb: Date.now() + ERINNERN_NACH_MS }),
    kanalGewechselt: () => pruefen(),
  };
}

module.exports = { macUpdater };
