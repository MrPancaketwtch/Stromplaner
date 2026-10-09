// Unveränderte Kopie aus Nomisimo/Planer-Server (client/ops.js, Commit 29d01ca), Apache License 2.0 – siehe LICENSE und NOTICE in diesem Ordner.
// Änderungen als Operationen: Grundlage für Undo je Transaktion und den Mehrbenutzer-Server.
//
// Ein Pfad ist ein Array aus Segmenten. Ein Text ist ein Objektschlüssel, { id } adressiert
// ein Element in einem Array aus Objekten mit ID (z. B. ["geraete", { id: "a1" }, "ports", { id: "p2" }, "ip"]).
// So bleiben Operationen gültig, auch wenn andere inzwischen Elemente eingefügt oder entfernt haben.
//
// Operationen (alle JSON, `old` nur für Invert/Undo und Konflikthinweise):
//   { op: "set",   path, value, old }          Feld setzen (ohne old = Feld war neu)
//   { op: "del",   path, old }                 Feld entfernen
//   { op: "ins",   path, value, after }        Element in ID-Array einfügen, nach ID `after` (null = vorn)
//   { op: "rem",   path, id, old, after }      Element aus ID-Array entfernen
//   { op: "order", path, ids, old }            Reihenfolge eines ID-Arrays
//   { op: "add",   path, value }               Wert in Mengen-Array aufnehmen (z. B. port.vlans)
//   { op: "drop",  path, value }               Wert aus Mengen-Array entfernen

// String-Arrays mit Mengensemantik: gleichzeitige Ergänzungen gehen nicht verloren.
export const SET_FIELDS = new Set(["vlans", "ziele", "protokolle", "ids"]);

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const hasId = (x) => isObj(x) && (typeof x.id === "string" || typeof x.id === "number");
const eq = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const cp = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

const isIdArray = (a) => {
  if (!Array.isArray(a) || !a.every(hasId)) return false;
  return new Set(a.map((x) => x.id)).size === a.length;
};
const isSetArray = (key, a) => SET_FIELDS.has(key) && Array.isArray(a) && a.every((x) => typeof x === "string" || typeof x === "number") && new Set(a).size === a.length;

/* ── Diff ─────────────────────────────────────────────────────────────── */

export const diff = (prev, next, path = [], out = []) => {
  if (eq(prev, next)) return out;
  if (isObj(prev) && isObj(next)) {
    for (const k of Object.keys(prev)) {
      if (!(k in next)) { if (prev[k] !== undefined) out.push({ op: "del", path: [...path, k], old: cp(prev[k]) }); }
      else diffValue(k, prev[k], next[k], [...path, k], out);
    }
    for (const k of Object.keys(next)) if (!(k in prev) && next[k] !== undefined) out.push({ op: "set", path: [...path, k], value: cp(next[k]) });
    return out;
  }
  out.push({ op: "set", path, value: cp(next), old: cp(prev) });
  return out;
};

const diffValue = (key, a, b, path, out) => {
  if (eq(a, b)) return;
  const idArr = Array.isArray(a) && Array.isArray(b) && (a.length || b.length) && isIdArray(a) && isIdArray(b);
  if (idArr) return diffIdArray(a, b, path, out);
  if (isSetArray(key, a) && isSetArray(key, b)) return diffSetArray(a, b, path, out);
  if (isObj(a) && isObj(b)) return diff(a, b, path, out);
  out.push({ op: "set", path, value: cp(b), old: cp(a) });
};

const diffIdArray = (a, b, path, out) => {
  const bIds = new Set(b.map((x) => x.id));
  const aById = new Map(a.map((x) => [x.id, x]));
  // Simulierte Reihenfolge nach rem/ins, um zu sehen, ob zusätzlich „order“ nötig ist.
  let sim = a.map((x) => x.id);
  let kept = null; // letzter bleibender Vorgänger: Undo fügt Entferntes (rückwärts) dahinter wieder ein
  for (const x of a) {
    if (bIds.has(x.id)) { kept = x.id; continue; }
    out.push({ op: "rem", path, id: x.id, old: cp(x), after: kept });
    sim = sim.filter((id) => id !== x.id);
  }
  b.forEach((x, i) => {
    const after = i ? b[i - 1].id : null;
    if (!aById.has(x.id)) {
      out.push({ op: "ins", path, value: cp(x), after });
      sim = insertAfter(sim, x.id, after, (v) => v);
    } else diff(aById.get(x.id), x, [...path, { id: x.id }], out);
  });
  const want = b.map((x) => x.id);
  if (!eq(sim, want)) out.push({ op: "order", path, ids: want, old: a.map((x) => x.id).filter((id) => bIds.has(id)) });
};

const diffSetArray = (a, b, path, out) => {
  const A = new Set(a), B = new Set(b);
  let sim = a.slice();
  for (const v of a) if (!B.has(v)) { out.push({ op: "drop", path, value: v }); sim = sim.filter((x) => x !== v); }
  for (const v of b) if (!A.has(v)) { out.push({ op: "add", path, value: v }); sim.push(v); }
  if (!eq(sim, b)) out.push({ op: "set", path, value: b.slice(), old: a.slice() });
};

const insertAfter = (arr, item, afterId, idOf) => {
  const res = arr.slice();
  if (afterId === null) { res.unshift(item); return res; }
  const i = res.findIndex((x) => idOf(x) === afterId);
  if (i < 0) res.push(item); else res.splice(i + 1, 0, item);
  return res;
};

/* ── Anwenden ─────────────────────────────────────────────────────────── */

// Löst einen Pfad bis zum vorletzten Segment auf. Liefert { parent, key } oder null, wenn der Pfad
// nicht (mehr) existiert, z. B. weil jemand das Gerät inzwischen gelöscht hat.
const resolve = (doc, path) => {
  let cur = doc;
  for (let i = 0; i < path.length - 1; i++) {
    const s = path[i];
    cur = isObj(s) ? (Array.isArray(cur) ? cur.find((x) => hasId(x) && x.id === s.id) : undefined) : cur?.[s];
    if (cur === undefined || cur === null || typeof cur !== "object") return null;
  }
  const key = path[path.length - 1];
  if (isObj(key)) {
    if (!Array.isArray(cur)) return null;
    const i = cur.findIndex((x) => hasId(x) && x.id === key.id);
    return i < 0 ? null : { parent: cur, key: i };
  }
  if (Array.isArray(cur) || !isObj(cur)) return null;
  return { parent: cur, key };
};
export const valueAt = (doc, path) => getAt(doc, path);
const getAt = (doc, path) => {
  if (!path.length) return doc;
  const r = resolve(doc, path);
  return r ? r.parent[r.key] : undefined;
};

// Wendet eine Operation an (verändert `doc`). Liefert true, wenn sie angewendet wurde,
// false, wenn ihr Ziel fehlt (Operation wird dann verworfen, siehe Analyse 4.4/4.6).
export const applyOp = (doc, o) => {
  switch (o.op) {
    case "set": {
      const r = resolve(doc, o.path);
      if (!r) return false;
      r.parent[r.key] = cp(o.value);
      return true;
    }
    case "del": {
      const r = resolve(doc, o.path);
      if (!r || Array.isArray(r.parent)) return false;
      if (!(r.key in r.parent)) return false;
      delete r.parent[r.key];
      return true;
    }
    case "ins": {
      const arr = getAt(doc, o.path);
      if (!Array.isArray(arr)) return false;
      if (arr.some((x) => hasId(x) && x.id === o.value.id)) return false;
      const res = insertAfter(arr, cp(o.value), o.after ?? null, (x) => x?.id);
      arr.splice(0, arr.length, ...res);
      return true;
    }
    case "rem": {
      const arr = getAt(doc, o.path);
      if (!Array.isArray(arr)) return false;
      const i = arr.findIndex((x) => hasId(x) && x.id === o.id);
      if (i < 0) return false;
      arr.splice(i, 1);
      return true;
    }
    case "order": {
      const arr = getAt(doc, o.path);
      if (!Array.isArray(arr)) return false;
      const pos = new Map(o.ids.map((id, i) => [id, i]));
      // Unbekannte (inzwischen von anderen eingefügte) Elemente behalten ihren Platz relativ zum Vorgänger: ans Ende.
      const known = arr.filter((x) => pos.has(x.id)).sort((x, y) => pos.get(x.id) - pos.get(y.id));
      const rest = arr.filter((x) => !pos.has(x.id));
      arr.splice(0, arr.length, ...known, ...rest);
      return true;
    }
    case "add": {
      const arr = getAt(doc, o.path);
      if (!Array.isArray(arr)) return false;
      if (!arr.includes(o.value)) arr.push(o.value);
      return true;
    }
    case "drop": {
      const arr = getAt(doc, o.path);
      if (!Array.isArray(arr)) return false;
      const i = arr.indexOf(o.value);
      if (i >= 0) arr.splice(i, 1);
      return true;
    }
    default:
      throw new Error(`Unbekannte Operation: ${o.op}`);
  }
};

// Wendet alle Operationen an. Liefert die Liste der verworfenen Operationen.
export const apply = (doc, ops) => {
  const skipped = [];
  for (const o of ops) if (!applyOp(doc, o)) skipped.push(o);
  return skipped;
};

/* ── Invertieren (Undo) ───────────────────────────────────────────────── */

const invertOp = (o) => {
  switch (o.op) {
    case "set": return o.old === undefined ? { op: "del", path: o.path, old: cp(o.value) } : { op: "set", path: o.path, value: cp(o.old), old: cp(o.value) };
    case "del": return { op: "set", path: o.path, value: cp(o.old) };
    case "ins": return { op: "rem", path: o.path, id: o.value.id, old: cp(o.value), after: o.after };
    case "rem": return { op: "ins", path: o.path, value: cp(o.old), after: o.after };
    case "order": return { op: "order", path: o.path, ids: o.old, old: o.ids };
    case "add": return { op: "drop", path: o.path, value: o.value };
    case "drop": return { op: "add", path: o.path, value: o.value };
    default: throw new Error(`Unbekannte Operation: ${o.op}`);
  }
};

export const invert = (ops) => ops.slice().reverse().map(invertOp);

/* ── Hilfen ───────────────────────────────────────────────────────────── */

// Lesbarer Schlüssel für einen Pfad, z. B. für Feld-Versionen auf dem Server ("geraete/#a1/ports/#p2/ip").
export const pathKey = (path) => path.map((s) => (isObj(s) ? `#${s.id}` : String(s))).join("/");
