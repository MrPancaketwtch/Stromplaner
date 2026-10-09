// Gemeinsames Arbeiten über den Planer-Server. Ohne aktive Sitzung ändert sich am Verhalten der App nichts.
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createSyncClient, vergleicheVersion } from "./sync-client.js";
import { diff, apply, pathKey } from "./ops.js";

export const APP_ID = "stromplaner";
const NAME_KEY = "sp_sitzung_name";

const clone = (x) => JSON.parse(JSON.stringify(x));

// „192.168.1.10“ → http://192.168.1.10:3001; mit http(s):// davor gilt die Adresse wie eingegeben
export const serverBasis = (server) => {
  let s = String(server || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (/^https?:\/\//.test(s)) return s;
  s = `http://${s}`;
  if (!/:\d+$/.test(s.slice(7))) s += ":3001";
  return s;
};
const wsUrl = (server) => serverBasis(server).replace(/^http/, "ws") + "/ws";

const GRUND = {
  "code-falsch": "Sitzungscode falsch.",
  gesperrt: "Zu viele Fehlversuche, bitte eine Minute warten.",
  token: "Server-Token falsch.",
  version: "Andere App-Version als die Sitzung.",
  unbekannt: "Sitzung nicht gefunden.",
  protokoll: "Server und App passen nicht zusammen.",
  "sitzung-geloescht": "Die Sitzung wurde gelöscht.",
};

export const serverApi = (server, token) => {
  const basis = serverBasis(server);
  const req = async (p, init = {}) => {
    if (!basis) throw new Error("Bitte Server-Adresse eintragen.");
    const headers = { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) };
    let r;
    try { r = await fetch(basis + p, { ...init, headers }); }
    catch { throw new Error(`Server ${basis} nicht erreichbar.`); }
    let body = {};
    try { body = await r.json(); } catch { if (r.ok) throw new Error(`Unter ${basis} antwortet kein Planer-Server.`); }
    if (r.status === 404 && p.startsWith("/api/sessions") && !body.error?.includes("Sitzung")) throw new Error("Der Server kann noch keine gemeinsamen Sitzungen – bitte auf den Planer-Server umstellen.");
    if (!r.ok) throw new Error(body.error === "Unauthorized" ? "Server-Token falsch." : GRUND[body.error] || body.error || `HTTP ${r.status}`);
    return body;
  };
  return {
    liste: () => req(`/api/sessions?app=${APP_ID}`),
    erstellen: (b) => req("/api/sessions", { method: "POST", body: JSON.stringify({ app: APP_ID, ...b }) }),
    pruefeCode: (id, code) => req(`/api/sessions/${id}/verlauf?limit=1`, { headers: { "X-Session-Code": code || "" } }),
  };
};

// Gleiche Version immer; eine neuere App übernimmt eine leere Sitzung (der Server stellt sie um), eine ältere nie
export const beitrittMoeglich = (s, version) => {
  const v = version || "dev";
  if (!s.appVersion || s.appVersion === v) return { ok: true };
  if (vergleicheVersion(v, s.appVersion) < 0) return { ok: false, grund: `Die Sitzung läuft mit Version ${s.appVersion}, deine App ist älter (${v}). Bitte zuerst aktualisieren.` };
  if (s.users) return { ok: false, grund: `Die Sitzung läuft mit Version ${s.appVersion} und hat gerade Teilnehmer. Alle brauchen dieselbe Version.` };
  return { ok: true, umstellen: true, grund: `Die Sitzung läuft noch mit Version ${s.appVersion}. Beim Beitreten wird sie auf deine Version ${v} umgestellt; ältere Apps können danach nicht mehr beitreten.` };
};

export const ladeName = () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } };
export const speichereName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* egal */ } };

// Einen Teil des Plans auf den neuen Server-Stand bringen, ohne noch nicht gesendete eigene Änderungen zu verlieren.
const rebase = (gemeldet, aktuell, remote) => {
  if (aktuell === gemeldet) return JSON.stringify(aktuell) === JSON.stringify(remote) ? aktuell : remote;
  const lokal = diff({ v: gemeldet }, { v: aktuell });
  const ziel = { v: clone(remote) };
  apply(ziel, lokal);
  return ziel.v;
};

/**
 * doc:     aktueller Plan als Objekt { key: wert } (aus dem React-State, bei jeder Änderung neu)
 * setters: { key: setState } für jeden Schlüssel in doc
 * defaults:{ key: () => leerer Wert } für Schlüssel, die im Stand der Sitzung fehlen
 */
export function useSitzung({ doc, setters, defaults, notify, version }) {
  const client = useRef(null);
  const basis = useRef(null);     // Stand, den der Client kennt (Server + eigene unbestätigte Änderungen)
  const gemeldet = useRef(null);  // React-State beim letzten Abgleich
  const veraltetRef = useRef(false);
  const tippPfad = useRef(null);
  const [zustand, setZustand] = useState(null); // { status, info, users, you, sperren, veraltet, ausstehend }
  const upd = (x) => setZustand((z) => (z ? { ...z, ...x } : z));
  const settersRef = useRef(setters); settersRef.current = setters;
  const defaultsRef = useRef(defaults); defaultsRef.current = defaults;
  const notifyRef = useRef(notify); notifyRef.current = notify;

  const uebernehmen = useCallback((serverDoc) => {
    const remote = clone(serverDoc);
    for (const k of Object.keys(settersRef.current)) if (remote[k] === undefined) remote[k] = defaultsRef.current[k]();
    const g = gemeldet.current || {};
    basis.current = remote;
    for (const [k, set] of Object.entries(settersRef.current)) set((prev) => rebase(g[k], prev, remote[k]));
  }, []);

  const verbinden = useCallback(({ server, token, session, code, name, info }) => {
    client.current?.close();
    veraltetRef.current = false;
    basis.current = null;
    setZustand({ status: "verbinden", info, users: [], you: null, sperren: [], veraltet: false, ausstehend: 0 });
    const c = createSyncClient({
      url: wsUrl(server), app: APP_ID, appVersion: version || "dev", session, code, name, token,
      onDoc: (d, i) => { uebernehmen(d); upd({ info: i || info, ausstehend: client.current?.ausstehend ?? 0 }); },
      onUsers: (users, you) => upd(you ? { users, you } : { users }),
      onSperren: (sperren) => upd({ sperren }),
      onStatus: (status, d) => {
        if (status === "fehler") {
          if (d?.reason !== "sitzung-geloescht") notifyRef.current((d?.reason === "version" && d?.detail) || GRUND[d?.reason] || d?.detail || "Verbindung zum Server fehlgeschlagen.", "err");
          return;
        }
        if (status === "beendet") {
          if (!d?.warVerbunden) { client.current = null; setZustand(null); return; }
          veraltetRef.current = true;
          upd({ status, veraltet: true });
          const von = d?.detail?.von;
          notifyRef.current(`${von ? `${von} hat die Sitzung beendet.` : "Die Sitzung wurde beendet."} Dein Stand bleibt als lokaler Plan erhalten.`, "warn");
          return;
        }
        upd({ status, ausstehend: d?.pending ?? client.current?.ausstehend ?? 0 });
      },
      onHinweis: (h) => {
        const n = notifyRef.current;
        if (h.art === "ueberschrieben") n(`${h.konflikte[0].von} hat dasselbe Feld gerade geändert. Dein Wert gilt jetzt.`, "warn");
        else if (h.art === "verworfen") n("Deine Änderung betraf etwas, das inzwischen gelöscht wurde, und wurde verworfen.", "warn");
        // „gesperrt“ (Sperranfrage abgelehnt) folgt immer auf ein „abgelehnt“ derselben Eingabe – kein zweiter Hinweis
        else if (h.art === "abgelehnt") n(h.reason === "gesperrt" ? `${typeof h.detail === "string" ? h.detail : "Jemand bearbeitet dieses Feld gerade"} – deine Eingabe wurde zurückgenommen.` : `Änderung abgelehnt: ${typeof h.detail === "string" ? h.detail : h.reason}`, "err");
      },
    });
    client.current = c;
  }, [version, uebernehmen]);

  const erstellen = useCallback(async ({ server, token, name, sitzungsName, code }) => {
    const info = await serverApi(server, token).erstellen({ name: sitzungsName, code: code || undefined, appVersion: version || "dev", doc });
    verbinden({ server, token, session: info.id, code, name, info });
    return info;
  }, [doc, verbinden, version]);

  const verlassen = useCallback(() => {
    client.current?.close();
    client.current = null;
    basis.current = null;
    setZustand(null);
  }, []);

  const beenden = useCallback(async () => {
    const c = client.current;
    if (!c) return;
    await c.beenden();
    client.current = null;
    basis.current = null;
    setZustand(null);
  }, []);

  useEffect(() => () => client.current?.close(), []);

  // Nach jedem Rendern: eigene Änderungen als Operationen an den Server
  useLayoutEffect(() => {
    gemeldet.current = doc;
    const c = client.current;
    if (!c || veraltetRef.current || !basis.current) return;
    const ops = diff(basis.current, doc);
    if (!ops.length) return;
    c.submit(ops);
    basis.current = clone(doc);
    upd({ ausstehend: c.ausstehend });
    // Wer in einem Feld tippt, sperrt es für die anderen
    const el = document.activeElement;
    if (el && /INPUT|TEXTAREA/.test(el.tagName) && ops.every((o) => o.op === "set") && new Set(ops.map((o) => pathKey(o.path))).size === 1) {
      const k = pathKey(ops[0].path);
      if (tippPfad.current !== k) { tippPfad.current = k; c.sperre(ops[0].path); }
    }
  }, [doc]);

  useEffect(() => {
    const blur = () => { if (tippPfad.current) { tippPfad.current = null; client.current?.freigabe(); } };
    document.addEventListener("focusout", blur);
    return () => document.removeEventListener("focusout", blur);
  }, []);

  const aktiv = !!zustand && !zustand.veraltet;
  return { zustand, aktiv, verbinden, erstellen, verlassen, beenden };
}
