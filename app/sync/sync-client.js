// Unveränderte Kopie aus Nomisimo/Planer-Server (client/sync-client.js, Commit 29d01ca), Apache License 2.0 – siehe LICENSE und NOTICE in diesem Ordner.
// Sync-Client für den Planer-Server, für jede App gleich (Netzwerkplaner, Stromplaner, Browser, Node).
//
// Der Client hält zwei Stände: `bestaetigt` (Stand des Servers bei `seq`) und den lokalen Stand
// = bestaetigt + eigene, noch unbestätigte Transaktionen. Eigene Operationen wirken sofort
// (optimistisch). Kommen fremde Operationen, werden die eigenen neu aufgesetzt (Rebase).
//
//   const sync = createSyncClient({ url: "ws://host:3001/ws", app: "netzwerkplaner", appVersion, session, code, name,
//                                   onDoc: (doc, info) => …, onUsers, onPresence, onHinweis, onStatus, onMigrieren });
//   sync.submit(ops)                     Operationen aus diff(prev, next)
//   await sync.intent("connect", {...})  Absicht, die der Server ausführt (wartet auf Bestätigung)
//   sync.presence({ tab, auswahl })
//   sync.sperre(path) / sync.freigabe()  Feld beim Tippen sperren (onSperren meldet fremde Sperren)
//   await sync.verlauf({ vor, limit })   Verlauf aller Nutzer, neueste zuerst
//   sync.close()
import { apply } from "./ops.js";

const clone = (x) => JSON.parse(JSON.stringify(x));
const zufall = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Versionen vergleichen (0.7.0-beta.8 < 0.7.0-beta.10 < 0.7.0): < 0, 0 oder > 0
export const vergleicheVersion = (a, b) => {
  const teile = (v) => { const [kern, vor] = String(v || "").split("-"); return { k: kern.split(".").map((x) => +x || 0), v: vor ? vor.split(".").map((x) => (isNaN(+x) ? x : +x)) : null }; };
  const x = teile(a), y = teile(b);
  for (let i = 0; i < 3; i++) if ((x.k[i] || 0) !== (y.k[i] || 0)) return (x.k[i] || 0) - (y.k[i] || 0);
  if (!x.v || !y.v) return x.v ? -1 : y.v ? 1 : 0; // Vorabversion < fertige Version
  for (let i = 0; i < Math.max(x.v.length, y.v.length); i++) {
    const p = x.v[i], q = y.v[i];
    if (p === q) continue;
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (typeof p === "number" && typeof q === "number") return p - q;
    return String(p) < String(q) ? -1 : 1;
  }
  return 0;
};

export const createSyncClient = (o) => {
  const WS = o.WebSocket || globalThis.WebSocket;
  const clientId = o.clientId || zufall();
  let ws = null, bestaetigt = null, lokal = null, seq = 0, info = null, geschlossen = false, selbst = null, letzterFehler = null, versuch = 0, timer = null;
  let pending = [], sperren = [], verlaufWartet = []; // { txId, baseSeq, ops?, intent?, resolve?, reject?, gesendet }
  const status = (s, detail) => o.onStatus?.(s, detail);

  const neuAufsetzen = () => {
    lokal = clone(bestaetigt);
    for (const t of pending) if (t.ops) apply(lokal, t.ops);
    o.onDoc?.(lokal, info);
  };
  const senden = (m) => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; };
  const sendeTx = (t) => { t.gesendet = senden({ type: "tx", txId: t.txId, baseSeq: t.baseSeq, ops: t.ops, intent: t.intent }); };

  const verbinden = () => {
    status(versuch ? "neu-verbinden" : "verbinden");
    ws = new WS(o.url);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", proto: 1, app: o.app, appVersion: o.appVersion, session: o.session, code: o.code, name: o.name, clientId, token: o.token, lastSeq: bestaetigt ? seq : undefined }));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
      if (m.type === "welcome") {
        versuch = 0;
        info = m.session;
        if (m.doc) bestaetigt = m.doc;
        else for (const t of m.ops) apply(bestaetigt, t.ops);
        seq = m.seq;
        o.onUsers?.(m.users, m.you);
        sperren = m.sperren || []; o.onSperren?.(sperren);
        status("online", { pending: pending.length });
        neuAufsetzen();
        for (const t of pending) sendeTx(t); // Warteschlange nach Abbruch neu einspielen
        if (m.migrieren && o.onMigrieren) {
          const ops = o.onMigrieren(clone(lokal));
          if (ops?.length) api.submit(ops);
        }
      } else if (m.type === "applied") {
        apply(bestaetigt, m.ops);
        seq = m.seq;
        neuAufsetzen();
      } else if (m.type === "ack") {
        const t = pending.find((x) => x.txId === m.txId);
        pending = pending.filter((x) => x.txId !== m.txId);
        if (m.ops.length) { apply(bestaetigt, m.ops); seq = m.seq; }
        neuAufsetzen();
        if (m.skipped?.length) o.onHinweis?.({ art: "verworfen", ops: m.skipped, txId: m.txId });
        if (m.conflicts?.length) o.onHinweis?.({ art: "ueberschrieben", konflikte: m.conflicts, txId: m.txId });
        t?.resolve?.(m.result);
      } else if (m.type === "reject") {
        const t = pending.find((x) => x.txId === m.txId);
        pending = pending.filter((x) => x.txId !== m.txId);
        neuAufsetzen();
        o.onHinweis?.({ art: "abgelehnt", reason: m.reason, detail: m.detail, txId: m.txId });
        t?.reject?.(Object.assign(new Error(typeof m.detail === "string" ? m.detail : m.reason), { reason: m.reason, detail: m.detail }));
      } else if (m.type === "users") o.onUsers?.(m.users);
      else if (m.type === "sperren") { sperren = m.sperren; o.onSperren?.(sperren); }
      else if (m.type === "sperre-abgelehnt") o.onHinweis?.({ art: "gesperrt", path: m.path, von: m.von });
      else if (m.type === "verlauf") verlaufWartet.shift()?.(m.eintraege);
      else if (m.type === "presence") o.onPresence?.(m.user, m.data);
      else if (m.type === "error") { letzterFehler = m; status("fehler", m); if (["code-falsch", "token", "version", "unbekannt", "protokoll", "sitzung-geloescht"].includes(m.reason)) geschlossen = true; }
    };
    ws.onclose = () => {
      ws = null;
      for (const t of pending) t.gesendet = false;
      if (selbst) return selbst(); // selbst verlassen oder beendet: keine Meldung
      // warVerbunden: false = Beitritt gescheitert (nichts ersetzt), true = laufende Sitzung ist vorbei
      if (geschlossen) return status("beendet", { warVerbunden: !!bestaetigt, reason: letzterFehler?.reason, detail: letzterFehler?.detail });
      status("offline", { pending: pending.length });
      versuch += 1;
      timer = setTimeout(verbinden, Math.min(15_000, 500 * 2 ** Math.min(versuch, 5)));
    };
    ws.onerror = () => {};
  };

  const api = {
    get doc() { return lokal; },
    get seq() { return seq; },
    get ausstehend() { return pending.length; },
    get online() { return !!ws && ws.readyState === 1 && !!bestaetigt; },
    clientId,
    submit(ops) {
      if (!ops?.length || !bestaetigt) return;
      const t = { txId: zufall(), baseSeq: seq, ops };
      pending.push(t);
      apply(lokal, ops);
      sendeTx(t);
    },
    intent(name, args) {
      return new Promise((resolve, reject) => {
        if (!api.online) return reject(Object.assign(new Error("Keine Verbindung zum Server"), { reason: "offline" }));
        const t = { txId: zufall(), baseSeq: seq, intent: { name, args }, resolve, reject };
        pending.push(t);
        sendeTx(t);
      });
    },
    presence(data) { senden({ type: "presence", data }); },
    get sperren() { return sperren; },
    sperre(path) { senden({ type: "sperre", path }); },
    freigabe(path) { senden({ type: "freigabe", path }); },
    verlauf({ vor, limit } = {}) {
      return new Promise((resolve, reject) => {
        if (!senden({ type: "verlauf", vor, limit })) return reject(new Error("Keine Verbindung zum Server"));
        verlaufWartet.push(resolve);
      });
    },
    // Lokale Kopie zum Speichern; nach Sitzungsende oder offline als veraltet markiert
    kopie() { return { doc: clone(lokal), seq, veraltet: !api.online, ausstehend: pending.length }; },
    close() { geschlossen = true; selbst = () => {}; clearTimeout(timer); ws?.close(); },
    // Sitzung für alle beenden; die anderen bekommen „sitzung-geloescht“ und behalten eine veraltete Kopie
    beenden() {
      return new Promise((resolve, reject) => {
        if (!api.online) return reject(new Error("Keine Verbindung zum Server"));
        // Ein älterer Server kennt „beenden“ nicht und antwortet nicht: dann nach 5 s abbrechen
        const t = setTimeout(() => { geschlossen = false; selbst = null; reject(new Error("Der Planer-Server kann das noch nicht, bitte den Server aktualisieren")); }, 5000);
        geschlossen = true; selbst = () => { clearTimeout(t); resolve(); }; clearTimeout(timer);
        senden({ type: "beenden" });
      });
    },
  };
  verbinden();
  return api;
};
