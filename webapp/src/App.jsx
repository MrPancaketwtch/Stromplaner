import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { Zap, ClipboardCheck, Plug, ClipboardList, Cloud, X, Pencil, CornerDownRight, MonitorUp, Check, TriangleAlert, QrCode, Upload, Download, Trash2, CircleCheck, CircleAlert } from 'lucide-react';

/* ── Shared constants ────────────────────────────────────────────────────── */
const CONN = {
  CEE16:   { label: '16A 3LNPE 400V',  amp: 16,   phases: 3 },
  CEE32:   { label: '32A 3LNPE 400V',  amp: 32,   phases: 3 },
  CEE63:   { label: '63A 3LNPE 400V',  amp: 63,   phases: 3 },
  CEE125:  { label: '125A 3LNPE 400V', amp: 125,  phases: 3 },
  CEE16_1: { label: '16A 1LNPE 230V',  amp: 16,   phases: 1 },
  CEE32_1: { label: '32A 1LNPE 230V',  amp: 32,   phases: 1 },
  PL200:   { label: '200A Powerlock',  amp: 200,  phases: 3 },
  PL400:   { label: '400A Powerlock',  amp: 400,  phases: 3 },
  PL660:   { label: '660A Powerlock',  amp: 660,  phases: 3 },
  PL1000:  { label: '1000A Powerlock', amp: 1000, phases: 3 },
  MC:      { label: 'Multicore',       amp: 16,   phases: 1, isMulticore: true },
  SCHUKO:  { label: 'Schuko',          amp: 16,   phases: 1 },
};

const uid  = () => Math.random().toString(36).slice(2, 9);
const now  = () => new Date().toISOString().slice(0, 10);

const LS_KEY     = 'sp_mobile_v1';
const SERVER_KEY = 'sp_sync_server';
const TOKEN_KEY  = 'sp_sync_token';
const PC_URL_KEY = 'sp_pc_share_url';

/* ── Empty plan ──────────────────────────────────────────────────────────── */
const newPlan = () => ({
  _format:   'stromplaner',
  _version:  4,
  _syncId:   uid() + uid(),
  meta:      { production: '', creator: '', version: '1', date: now() },
  mainConns: [],
  boxTypes:  [],
  loads:     [],
  instances: [],
  placements: [],
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const getBoxType  = (plan, id)    => plan.boxTypes.find(b => b.id === id);
const getLoad     = (plan, id)    => plan.loads.find(l => l.id === id);

// Ältere Handy-Pläne (instName/box/consumers) ins Desktop-Format (name/typeId + placements) überführen
const migratePlan = (p) => {
  const placements = [...(p.placements || [])];
  const instances  = (p.instances || []).map(i => {
    if (!('instName' in i || 'box' in i || 'consumers' in i)) return i;
    const { instName: oldName, box, consumers, ...rest } = i;
    (consumers || []).forEach(c => placements.push({ id: c.id || uid(), instanceId: i.id, outletId: c.outId || '', mcSlot: null, loadId: c.loadId || '' }));
    return { parentId: null, parentOutletId: null, mainConnectionId: null, ...rest, name: rest.name ?? oldName ?? '', typeId: rest.typeId ?? box };
  });
  return { ...p, instances, placements };
};

// Steckplätze wie am Desktop: normale Anschlüsse 1:1, Multicore je Steckplatz (mcSlot 1…n, Id `${outletId}_s${n}`)
const slotGroups = (bt) => sortOutlets(bt?.outlets || []).map(o => ({
  outlet: o,
  slots: isMulticore(o.connector)
    ? Array.from({ length: o.mcSlots || 6 }, (_, k) => ({ key: `${o.id}_s${k + 1}`, outlet: o, mcSlot: k + 1, label: `SP ${k + 1}`, sub: `${PHASES[k % 3]} · ${o.amp}A` }))
    : [{ key: o.id, outlet: o, mcSlot: null, label: o.label, sub: `${CONN[o.connector]?.label || o.connector}${o.amp ? ` · ${o.amp}A` : ''}` }],
}));
const slotPlacements = (plan, instId, slot) => plan.placements.filter(p =>
  p.instanceId === instId && p.outletId === slot.outlet.id && (slot.mcSlot == null || p.mcSlot === slot.mcSlot));
const slotKids = (plan, instId, key) => plan.instances.filter(c => c.parentId === instId && c.parentOutletId === key);

// Steckungen, die keinem Steckplatz zugeordnet sind (am Desktop noch ohne Anschluss / Steckplatz)
const unslottedPlacements = (plan, inst, bt) => plan.placements.filter(p => {
  if (p.instanceId !== inst.id) return false;
  const o = bt?.outlets?.find(x => x.id === p.outletId);
  if (!o) return true;
  return isMulticore(o.connector) && !(p.mcSlot >= 1 && p.mcSlot <= (o.mcSlots || 6));
});

// „2× MAC One, Cobra“
const loadSummary = (plan, pls) => {
  const groups = [];
  pls.forEach(p => {
    const g = groups.find(x => x.loadId === p.loadId);
    if (g) g.n++; else groups.push({ loadId: p.loadId, n: 1 });
  });
  return groups.map(g => (g.n > 1 ? `${g.n}× ` : '') + (getLoad(plan, g.loadId)?.name || (g.loadId ? '(unbekannt)' : '(leer)'))).join(', ');
};

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Root                                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [tab,     setTab]     = useState('pruefung');
  const [plan,    setPlan]    = useState(null);
  const [server,  setServer]  = useState(() => localStorage.getItem(SERVER_KEY) || '');
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY)  || '');
  const [pcUrl,   setPcUrl]   = useState(() => localStorage.getItem(PC_URL_KEY) || '');

  /* load */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      setPlan(raw ? migratePlan(JSON.parse(raw)) : newPlan());
    } catch {
      setPlan(newPlan());
    }
  }, []);

  /* autosave */
  useEffect(() => {
    if (plan) localStorage.setItem(LS_KEY, JSON.stringify(plan));
  }, [plan]);

  /* persist sync config */
  useEffect(() => { localStorage.setItem(SERVER_KEY, server); }, [server]);
  useEffect(() => { localStorage.setItem(TOKEN_KEY,  token);  }, [token]);
  useEffect(() => { localStorage.setItem(PC_URL_KEY, pcUrl);  }, [pcUrl]);

  if (!plan) return <div className="loading">Laden…</div>;

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo"><Zap size={20} fill="currentColor" strokeWidth={1.5} aria-hidden="true" /></span>
        <span className="header-title">Stromplaner</span>
        {plan.meta.production && (
          <span className="header-sub">{plan.meta.production}</span>
        )}
      </header>

      <main className="app-main">
        {tab === 'pruefung' && (
          <PruefungTab plan={plan} setPlan={setPlan} pcUrl={pcUrl} />
        )}
        {tab === 'steckplan' && (
          <SteckplanTab plan={plan} setPlan={setPlan} />
        )}
        {tab === 'projekt' && (
          <ProjektTab plan={plan} setPlan={setPlan} />
        )}
        {tab === 'sync' && (
          <SyncTab
            plan={plan} setPlan={setPlan}
            server={server} setServer={setServer}
            token={token}  setToken={setToken}
            pcUrl={pcUrl}  setPcUrl={setPcUrl}
          />
        )}
      </main>

      <nav className="tab-bar">
        {[
          { id: 'pruefung',  Icon: ClipboardCheck, label: 'Prüfung'   },
          { id: 'steckplan', Icon: Plug,           label: 'Steckplan' },
          { id: 'projekt',   Icon: ClipboardList,  label: 'Projekt'   },
          { id: 'sync',      Icon: Cloud,          label: 'Sync'      },
        ].map(t => (
          <button
            key={t.id}
            className={'tab-btn' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon"><t.Icon size={22} aria-hidden="true" /></span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Steckplan Tab                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */
function SteckplanTab({ plan, setPlan }) {
  const [modal, setModal] = useState(null);
  // modal: null | {kind:'add'} | {kind:'inst', instId} | {kind:'pick', instId, slotKey}

  const hasLibrary = plan.boxTypes.length > 0;

  // Datenmodell wie am Desktop (addInstance / removeInstance / addPlacement / removePlacement)
  const addInstance = (typeId, name) => {
    const type = getBoxType(plan, typeId);
    if (!type) return;
    const count = plan.instances.filter(i => i.typeId === typeId).length;
    const inst = {
      id: uid(), typeId,
      name: name.trim() || (count > 0 ? `${type.name} #${count + 1}` : type.name),
      parentId: null, parentOutletId: null, mainConnectionId: null,
    };
    setPlan(p => ({ ...p, instances: [inst, ...p.instances] }));
    setModal({ kind: 'inst', instId: inst.id });
  };

  const updateInstance = (id, patch) =>
    setPlan(p => ({ ...p, instances: p.instances.map(i => i.id === id ? { ...i, ...patch } : i) }));

  const removeInstance = (id) => {
    setPlan(p => ({
      ...p,
      instances:  p.instances.filter(i => i.id !== id).map(i => i.parentId === id ? { ...i, parentId: null, parentOutletId: null } : i),
      placements: p.placements.filter(pl => pl.instanceId !== id),
    }));
    setModal(null);
  };

  const addPlacement = (instanceId, outletId, mcSlot, loadId) =>
    setPlan(p => ({ ...p, placements: [...p.placements, { id: uid(), instanceId, outletId, mcSlot, loadId }] }));

  const removePlacements = (ids) =>
    setPlan(p => ({ ...p, placements: p.placements.filter(pl => !ids.includes(pl.id)) }));

  return (
    <div className="page">
      {!hasLibrary && (
        <div className="notice">
          Noch keine Bibliothek geladen.{'\n'}
          Gehe zu <strong>Sync</strong> und lade einen bestehenden Plan vom Server, oder erstelle einen neuen Plan auf dem Desktop und synchronisiere ihn.
        </div>
      )}

      {plan.instances.length === 0 && hasLibrary && (
        <div className="notice">Noch keine Verteiler angelegt. Tippe auf +.</div>
      )}

      <div className="inst-list">
        {plan.instances.map(inst => {
          const bt    = getBoxType(plan, inst.typeId);
          const slots = slotGroups(bt).flatMap(g => g.slots);
          const assigned = slots.filter(s => slotPlacements(plan, inst.id, s).length || slotKids(plan, inst.id, s.key).length).length;
          const total    = slots.length;
          return (
            <button
              key={inst.id}
              className="inst-card"
              onClick={() => setModal({ kind: 'inst', instId: inst.id })}
            >
              <div className="inst-name">{instName(inst)}</div>
              <div className="inst-meta">
                <span className="inst-type">{bt?.name || inst.typeId || '?'}</span>
                <span className={'inst-fill' + (assigned === total && total > 0 ? ' full' : '')}>
                  {assigned}/{total} belegt
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {hasLibrary && (
        <button className="fab" onClick={() => setModal({ kind: 'add' })}>+</button>
      )}

      {/* ── Add instance modal ── */}
      {modal?.kind === 'add' && (
        <AddInstModal
          plan={plan}
          onAdd={addInstance}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Instance detail sheet ── */}
      {modal?.kind === 'inst' && (() => {
        const inst = plan.instances.find(i => i.id === modal.instId);
        if (!inst) return null;
        return (
          <InstSheet
            inst={inst} bt={getBoxType(plan, inst.typeId)} plan={plan}
            onPickSlot={(slotKey) => setModal({ kind: 'pick', instId: inst.id, slotKey })}
            onRename={(name) => updateInstance(inst.id, { name })}
            onDelete={() => removeInstance(inst.id)}
            onClose={() => setModal(null)}
          />
        );
      })()}

      {/* ── Consumer picker sheet ── */}
      {modal?.kind === 'pick' && (() => {
        const inst = plan.instances.find(i => i.id === modal.instId);
        const slot = slotGroups(getBoxType(plan, inst?.typeId)).flatMap(g => g.slots).find(s => s.key === modal.slotKey);
        if (!inst || !slot) return null;
        const pls  = slotPlacements(plan, inst.id, slot);
        const back = () => setModal({ kind: 'inst', instId: inst.id });
        return (
          <PickerSheet
            plan={plan}
            title={slot.mcSlot ? `${slot.outlet.label} – ${slot.label}` : slot.label}
            threePhase={is3ph(slot.outlet.connector)}
            placements={pls}
            onAdd={(loadId) => { addPlacement(inst.id, slot.outlet.id, slot.mcSlot, loadId); back(); }}
            onRemove={(id) => removePlacements([id])}
            onClear={() => removePlacements(pls.map(p => p.id))}
            onClose={back}
          />
        );
      })()}
    </div>
  );
}

/* ── Add instance modal ──────────────────────────────────────────────────── */
function AddInstModal({ plan, onAdd, onClose }) {
  const boxTypes = plan.boxTypes;
  const [boxId, setBoxId] = useState(boxTypes[0]?.id || '');
  const [name,  setName]  = useState('');

  const type  = boxTypes.find(b => b.id === boxId);
  const count = plan.instances.filter(i => i.typeId === boxId).length;
  const defaultName = type ? (count > 0 ? `${type.name} #${count + 1}` : type.name) : '';

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--center" onClick={e => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">Neuer Verteiler</span>
          <button className="sheet-close" aria-label="Schließen" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="sheet-body">
          <label className="field-label">Typ</label>
          <select className="field-select" value={boxId} onChange={e => setBoxId(e.target.value)}>
            {boxTypes.map(bt => (
              <option key={bt.id} value={bt.id}>{bt.name}</option>
            ))}
          </select>
          <label className="field-label" style={{ marginTop: 16 }}>Name / Standort</label>
          <input
            className="field-input"
            value={name}
            placeholder={defaultName || 'z.B. Bühne Links'}
            autoFocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && boxId && onAdd(boxId, name)}
          />
        </div>
        <div className="sheet-footer">
          <button className="btn btn--secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn--primary" disabled={!boxId} onClick={() => onAdd(boxId, name)}>
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Instance detail sheet ───────────────────────────────────────────────── */
function InstSheet({ inst, bt, plan, onPickSlot, onRename, onDelete, onClose }) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(inst.name || '');

  const commitRename = () => {
    setEditing(false);
    if (nameVal !== (inst.name || '')) onRename(nameVal);
  };

  const parent = plan.instances.find(i => i.id === inst.parentId);
  const loose  = unslottedPlacements(plan, inst, bt);

  const slotRow = (slot) => {
    const pls    = slotPlacements(plan, inst.id, slot);
    const kids   = slotKids(plan, inst.id, slot.key);
    const filled = pls.length > 0 || kids.length > 0;
    return (
      <button
        key={slot.key}
        className={'outlet-row' + (filled ? ' outlet-row--filled' : '') + (slot.mcSlot ? ' outlet-row--slot' : '')}
        onClick={() => onPickSlot(slot.key)}
      >
        <div className="outlet-info">
          <span className="outlet-label">{slot.label}</span>
          <span className="outlet-type">{slot.sub}</span>
        </div>
        <div className="outlet-consumer">
          <div className="consumer-stack">
            {kids.length > 0 && <span className="consumer-kid"><CornerDownRight size={12} className="inline-icon" aria-hidden="true" />{kids.map(instName).join(', ')}</span>}
            {pls.length > 0 && <span className="consumer-name">{loadSummary(plan, pls)}</span>}
            {!filled && <span className="consumer-empty">Leer</span>}
          </div>
          <span className="outlet-arrow">›</span>
        </div>
      </button>
    );
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--bottom" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          {editing ? (
            <input
              className="field-input field-input--inline"
              value={nameVal}
              autoFocus
              onChange={e => setNameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => e.key === 'Enter' && commitRename()}
            />
          ) : (
            <span className="sheet-title" onClick={() => setEditing(true)}>
              {instName(inst)} <Pencil size={14} className="inline-icon" aria-label="umbenennen" />
            </span>
          )}
          <button className="sheet-close" aria-label="Schließen" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="sheet-sub">
          {bt?.name || '?'} · {CONN[bt?.feedConnector]?.label || bt?.feedConnector || ''} {bt?.feedAmp}A
          {parent && ` · an ${instName(parent)}`}
        </div>

        <div className="outlet-list">
          {slotGroups(bt).map(({ outlet, slots }) => {
            if (!isMulticore(outlet.connector)) return slotRow(slots[0]);
            const kids = slotKids(plan, inst.id, outlet.id);
            return (
              <React.Fragment key={outlet.id}>
                <div className="outlet-group">
                  <span className="outlet-label">{outlet.label}</span>
                  <span className="outlet-type">Multicore · {slots.length} Steckplätze</span>
                  {kids.length > 0 && <span className="consumer-kid"><CornerDownRight size={12} className="inline-icon" aria-hidden="true" />{kids.map(instName).join(', ')}</span>}
                </div>
                {slots.map(slotRow)}
              </React.Fragment>
            );
          })}

          {loose.length > 0 && (
            <>
              <div className="outlet-group">
                <span className="outlet-label">Ohne Anschluss / Steckplatz</span>
                <span className="outlet-type">Am PC im Steckplan zuordnen</span>
              </div>
              {loose.map(p => {
                const o = bt?.outlets?.find(x => x.id === p.outletId);
                return (
                  <div key={p.id} className="outlet-row outlet-row--static">
                    <div className="outlet-info">
                      <span className="outlet-label">{getLoad(plan, p.loadId)?.name || '(leer)'}</span>
                      <span className="outlet-type">{o ? `${o.label} · kein Steckplatz` : 'kein Anschluss'}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="sheet-footer sheet-footer--danger">
          <button className="btn btn--danger" onClick={() => {
            if (window.confirm(`"${instName(inst)}" wirklich löschen? Alle Steckungen dieses Verteilers gehen verloren.`)) onDelete();
          }}>
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Consumer picker sheet ───────────────────────────────────────────────── */
function PickerSheet({ plan, title, threePhase, placements, onAdd, onRemove, onClear, onClose }) {
  const [search, setSearch] = useState('');
  // Wie am Desktop: 3-phasige Verbraucher nur an 3-phasige Anschlüsse und umgekehrt
  const loads = plan.loads
    .filter(l => !!l.threePhase === threePhase)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { numeric: true, sensitivity: 'base' }));
  const filtered = loads.filter(l =>
    !search || (l.name || '').toLowerCase().includes(search.toLowerCase())
  );
  const countOf = (loadId) => placements.filter(p => p.loadId === loadId).length;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--bottom sheet--tall" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span className="sheet-title">Verbraucher — {title}</span>
          <button className="sheet-close" aria-label="Schließen" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="picker-search">
          <input
            className="field-input"
            placeholder="Suchen…"
            value={search}
            autoFocus
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="picker-list">
          {placements.length > 0 && (
            <>
              <div className="picker-section">
                <span>Gesteckt ({placements.length})</span>
                <button className="link-btn link-btn--muted" onClick={onClear}>Alle entfernen</button>
              </div>
              {placements.map(p => {
                const l = getLoad(plan, p.loadId);
                return (
                  <div key={p.id} className="picker-item picker-item--selected">
                    <span className="picker-name">{l?.name || '(unbekannt)'}</span>
                    <span className="picker-actions">
                      {l && <span className="picker-meta">{l.watt || '?'} W{l.threePhase ? ' 3ph' : ''}</span>}
                      <button className="picker-remove" aria-label="Entfernen" onClick={() => onRemove(p.id)}><X size={18} /></button>
                    </span>
                  </div>
                );
              })}
              <div className="picker-section"><span>Weiteren Verbraucher stecken</span></div>
            </>
          )}
          {placements.length === 0 && (
            <button className="picker-item picker-item--selected" onClick={onClose}>
              <span className="picker-name">Leer</span>
            </button>
          )}
          {filtered.map(l => {
            const n = countOf(l.id);
            return (
              <button
                key={l.id}
                className="picker-item"
                onClick={() => onAdd(l.id)}
              >
                <span className="picker-name">{l.name}</span>
                <span className="picker-meta">{n > 0 && `${n}× gesteckt · `}{l.watt || '?'} W{l.threePhase ? ' 3ph' : ''}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="picker-empty">
              {loads.length ? 'Keine Treffer' : `Keine ${threePhase ? '3-phasigen' : '1-phasigen'} Verbraucher in der Bibliothek`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Projekt Tab                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */
function ProjektTab({ plan, setPlan }) {
  const set = (key, val) => setPlan(p => ({ ...p, meta: { ...p.meta, [key]: val } }));

  const fields = [
    { key: 'production', label: 'Veranstaltung',   type: 'text'  },
    { key: 'date',       label: 'Datum',            type: 'date'  },
    { key: 'creator',    label: 'Ersteller',        type: 'text'  },
    { key: 'version',   label: 'Version',          type: 'text'  },
  ];

  return (
    <div className="page">
      <div className="section">
        <div className="section-title">Projektdaten</div>
        {fields.map(f => (
          <div key={f.key} className="field-row">
            <label className="field-label">{f.label}</label>
            <input
              className="field-input"
              type={f.type}
              value={plan.meta[f.key] || ''}
              onChange={e => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-title">Bibliothek</div>
        <div className="stat-row">
          <span>Verteiler-Typen</span>
          <strong>{plan.boxTypes.length}</strong>
        </div>
        <div className="stat-row">
          <span>Verbraucher</span>
          <strong>{plan.loads.length}</strong>
        </div>
        <div className="stat-row">
          <span>Verteiler-Instanzen</span>
          <strong>{plan.instances.length}</strong>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Prüfung Tab (Errichtungsprüfung) – Datenformat identisch zur Desktop-App   */
/* ══════════════════════════════════════════════════════════════════════════ */
const PHASES      = ['L1', 'L2', 'L3'];
const SICHT_ITEMS = ['Schaltgeräte', 'Steckverbinder', 'Leitungen', 'Gehäuse', 'Kennzeichnung', 'Basisschutz'];
const IK_FACTOR   = { B: 5, C: 10, D: 20, K: 14 };

const inspMetaDef = () => ({ inspector: '', date: now(), time: '', equipment: '', address: '', location: '', netType: '' });
const IR_DEF = { voltL1N: '', voltL2N: '', voltL3N: '', voltL1L2: '', voltL2L3: '', voltL1L3: '', voltNPE: '', voltL1PE: '', voltL2PE: '', voltL3PE: '', phaseRot: '', rPE: '', rIso: '', zs: '', ik: '', sicht: [null, null, null, null, null, null], bemerkung: '', bemerkungSchwere: 'bad', outlets: {} };
const OR_DEF = { rcdT1: '', rcdIan: '', ok: false, zs: '', ik: '', zsL1: '', zsL2: '', zsL3: '', ikL1: '', ikL2: '', ikL3: '', notInUse: false, zsOverride: '', ikOverride: '', zsOverrideL1: '', zsOverrideL2: '', zsOverrideL3: '', ikOverrideL1: '', ikOverrideL2: '', ikOverrideL3: '', overrideActive: false, cableLen: '', cableA: '', cosPhi: '0.95' };

const VOLT_GROUPS = [
  [{ key: 'voltL1N',  label: 'L1–N',  min: 207, max: 244 }, { key: 'voltL2N',  label: 'L2–N',  min: 207, max: 244 }, { key: 'voltL3N',  label: 'L3–N',  min: 207, max: 244 }],
  [{ key: 'voltL1L2', label: 'L1–L2', min: 360, max: 424 }, { key: 'voltL2L3', label: 'L2–L3', min: 360, max: 424 }, { key: 'voltL1L3', label: 'L1–L3', min: 360, max: 424 }],
  [{ key: 'voltL1PE', label: 'L1–PE', min: 207, max: 244 }, { key: 'voltL2PE', label: 'L2–PE', min: 207, max: 244 }, { key: 'voltL3PE', label: 'L3–PE', min: 207, max: 244 }],
  [{ key: 'voltNPE',  label: 'N–PE',  max: 1 }],
];

const is3ph       = (c) => (CONN[c]?.phases || 1) === 3;
const isMulticore = (c) => !!CONN[c]?.isMulticore;
const instName    = (i) => i?.name || i?.instName || '(kein Name)';
const instTypeId  = (i) => i?.typeId || i?.box;
const alphaSort   = (arr) => [...arr].sort((a, b) => instName(a).localeCompare(instName(b), 'de', { numeric: true, sensitivity: 'base' }));
const sortOutlets = (outlets) => [...outlets].sort((a, b) => {
  const as = a.connector === 'SCHUKO' ? 0 : 1, bs = b.connector === 'SCHUKO' ? 0 : 1;
  if (as !== bs) return as - bs;
  return (a.label || '').localeCompare(b.label || '', 'de', { numeric: true });
});
const fmtOhm    = (n) => n.toFixed(2).replace('.', ',');
const rangeHint = (min, max, unit) => min !== undefined && max !== undefined ? `${min}–${max} ${unit}` : max !== undefined ? `≤ ${max} ${unit}` : `≥ ${min} ${unit}`;

const chk = (val, min, max) => {
  if (val === '' || val == null) return null;
  const n = parseFloat(String(val).replace(',', '.'));
  if (isNaN(n)) return null;
  if (min !== undefined && n < min) return false;
  if (max !== undefined && n > max) return false;
  return true;
};

const hasInspData   = (plan) => Object.keys(plan?.inspResults || {}).length > 0;
const confirmReplace = (plan) => !hasInspData(plan) ||
  window.confirm('Auf dem Handy sind Prüfergebnisse gespeichert. Wirklich durch den neuen Plan ersetzen?');

const irOf = (res, iid) => {
  const sv = res[iid] || {};
  return { ...IR_DEF, ...sv, sicht: sv.sicht ? [...sv.sicht] : [...IR_DEF.sicht], outlets: sv.outlets || {} };
};
const orOf = (res, iid, oid) => ({ ...OR_DEF, ...(irOf(res, iid).outlets[oid] || {}) });

function sortTopo(instances) {
  const out = [], seen = new Set();
  const visit = (pid, depth) => alphaSort(instances.filter(i => (i.parentId || null) === pid)).forEach(i => {
    if (seen.has(i.id)) return;
    seen.add(i.id); out.push({ inst: i, depth }); visit(i.id, depth + 1);
  });
  visit(null, 0);
  alphaSort(instances).forEach(i => {
    if (seen.has(i.id)) return;
    seen.add(i.id); out.push({ inst: i, depth: 0 }); visit(i.id, 1);
  });
  return out;
}

function buildRows(plan, inst) {
  const type    = plan.boxTypes.find(b => b.id === instTypeId(inst));
  const outlets = type ? sortOutlets(type.outlets || []) : [];
  const kidsOf  = (oid) => plan.instances.filter(c => c.parentId === inst.id && c.parentOutletId === oid);

  const rcdRows = (type?.rcds || []).map(rcd => ({ oid: `rcd_${rcd.id}`, label: rcd.label, isGroup: true, iAn: rcd.mA, prot: `RCD ${rcd.mA} mA` }));
  outlets.filter(o => o.protection === 'RCBO').forEach(o => {
    const mA = o.rcdMa ?? 30, prot = `RCBO ${o.amp}A / ${mA}mA`;
    if (isMulticore(o.connector)) {
      for (let s = 1; s <= (o.mcSlots || 6); s++) rcdRows.push({ oid: `${o.id}_s${s}`, label: `${o.label} – SP ${s} (${PHASES[(s - 1) % 3]})`, iAn: mA, prot });
    } else {
      rcdRows.push({ oid: o.id, label: o.label, iAn: mA, prot });
    }
  });

  const loopRows = [];
  outlets.forEach(o => {
    const base = { hasRcd: o.protection === 'RCBO' || !!o.rcdId, breaker: o.breaker || 'C' };
    if (isMulticore(o.connector)) {
      for (let s = 1; s <= (o.mcSlots || 6); s++) {
        const oid = `${o.id}_s${s}`;
        loopRows.push({ ...base, oid, label: `${o.label} – SP ${s}`, sub: `${PHASES[(s - 1) % 3]} · ${o.amp}A`, amp: o.amp || 16, is3p: false, kids: kidsOf(oid) });
      }
    } else {
      loopRows.push({ ...base, oid: o.id, label: o.label, sub: `${CONN[o.connector]?.label || o.connector} ${o.amp}A`, amp: o.amp || type?.feedAmp || 16, is3p: is3ph(o.connector), kids: kidsOf(o.id) });
    }
  });
  loopRows.forEach(r => {
    const f = IK_FACTOR[r.breaker] || 10;
    r.ikLim = r.amp * f;
    r.zsLim = r.hasRcd ? 2.0 : parseFloat((230 / (r.amp * f)).toFixed(2));
  });
  return { type, rcdRows, loopRows };
}

// Schlechteste Zs/Ik aus angeschlossenen Unterverteilern – rekursiv über alle Ebenen
function childDerived(plan, res, childIds) {
  const zs = [], ik = [];
  childIds.forEach(cid => {
    const ci = plan.instances.find(i => i.id === cid);
    const t  = plan.boxTypes.find(b => b.id === instTypeId(ci));
    (t?.outlets || []).forEach(co => {
      const slots = isMulticore(co.connector)
        ? Array.from({ length: co.mcSlots || 6 }, (_, k) => ({ oid: `${co.id}_s${k + 1}`, is3p: false }))
        : [{ oid: co.id, is3p: is3ph(co.connector) }];
      slots.forEach(({ oid, is3p }) => {
        const gc = plan.instances.filter(x => x.parentId === cid && x.parentOutletId === oid);
        if (gc.length) {
          const d = childDerived(plan, res, gc.map(x => x.id));
          if (d.zs) zs.push(Number(d.zs));
          if (d.ik) ik.push(Number(d.ik));
          return;
        }
        const or = orOf(res, cid, oid);
        if (or.notInUse) return;
        const zk = is3p ? ['zsL1', 'zsL2', 'zsL3'] : ['zs'];
        const ikk = is3p ? ['ikL1', 'ikL2', 'ikL3'] : ['ik'];
        zk.forEach(k => { if (or[k]) zs.push(Number(or[k])); });
        ikk.forEach(k => { if (or[k]) ik.push(Number(or[k])); });
      });
    });
  });
  return { zs: zs.length ? Math.max(...zs).toFixed(2) : '', ik: ik.length ? Math.min(...ik).toFixed(0) : '' };
}

// Am Desktop nachgetragene Eingangswerte haben Vorrang vor der Ableitung
function kidValues(plan, res, inst, row) {
  const or = orOf(res, inst.id, row.oid);
  const d  = childDerived(plan, res, row.kids.map(k => k.id));
  const has = or.overrideActive || ['zsOverride', 'ikOverride', 'zsOverrideL1', 'zsOverrideL2', 'zsOverrideL3', 'ikOverrideL1', 'ikOverrideL2', 'ikOverrideL3'].some(k => or[k]);
  if (!has) return { ...d, override: false };
  const nums = (keys) => keys.map(k => or[k]).filter(v => v !== '' && v != null).map(Number);
  const zsL = nums(['zsOverrideL1', 'zsOverrideL2', 'zsOverrideL3']);
  const ikL = nums(['ikOverrideL1', 'ikOverrideL2', 'ikOverrideL3']);
  return {
    zs: (row.is3p && zsL.length ? Math.max(...zsL).toFixed(2) : or.zsOverride) || d.zs,
    ik: (row.is3p && ikL.length ? Math.min(...ikL).toFixed(0) : or.ikOverride) || d.ik,
    override: true,
  };
}

function evalInst(plan, res, inst) {
  const ir = irOf(res, inst.id);
  const { rcdRows, loopRows } = buildRows(plan, inst);
  const r = [];
  VOLT_GROUPS.flat().forEach(f => r.push(chk(ir[f.key], f.min, f.max)));
  rcdRows.forEach(row => {
    const or = orOf(res, inst.id, row.oid);
    r.push(chk(or.rcdIan, row.iAn / 2, row.iAn), chk(or.rcdT1, undefined, 300));
  });
  loopRows.forEach(row => {
    const or = orOf(res, inst.id, row.oid);
    if (row.kids.length || or.notInUse) return;
    (row.is3p ? ['zsL1', 'zsL2', 'zsL3'] : ['zs']).forEach(k => r.push(chk(or[k], undefined, row.zsLim)));
    (row.is3p ? ['ikL1', 'ikL2', 'ikL3'] : ['ik']).forEach(k => r.push(chk(or[k], row.ikLim, undefined)));
  });
  return {
    sichtOk: ir.sicht.filter(v => v === true).length,
    bad:     r.filter(x => x === false).length,
    filled:  r.filter(x => x !== null).length,
    remark:  ir.bemerkung ? (ir.bemerkungSchwere || 'bad') : null,
  };
}

function NumInput({ value, ok, onChange }) {
  return (
    <input
      className={'num-input' + (ok === true ? ' num-input--ok' : ok === false ? ' num-input--bad' : '')}
      type="text"
      inputMode="decimal"
      enterKeyHint="next"
      placeholder="–"
      value={value || ''}
      onChange={e => onChange(e.target.value.replace(/,/g, '.'))}
    />
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} type="button" className={'seg-btn' + (value === v ? ' seg-btn--on' : '')} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function SendToPc({ plan, pcUrl }) {
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState(null);

  const send = async () => {
    setBusy(true);
    setMsg({ text: 'Gesendet – bitte am PC bestätigen…', err: false });
    try {
      const r = await fetch(pcUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error || `HTTP ${r.status}`);
      setMsg({ text: res.mode === 'insp' ? 'Prüfergebnisse am PC übernommen' : 'Plan am PC übernommen', err: false });
    } catch (e) {
      const offline = e instanceof TypeError;
      setMsg({ text: offline ? 'PC nicht erreichbar. Läuft am PC „Lokal im WLAN teilen“ und ist das Handy im selben WLAN?' : e.message, err: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section">
      <div className="section-title">An PC zurücksenden</div>
      {pcUrl ? (
        <>
          <button className="btn btn--primary" style={{ width: '100%' }} disabled={busy} onClick={send}>
            {busy ? 'Warte auf PC…' : <><MonitorUp size={18} aria-hidden="true" />An PC zurücksenden</>}
          </button>
          <div className="meas-hint" style={{ marginTop: 6 }}>Ziel: {pcUrl.replace(/^https?:\/\//, '').replace(/\/plan\.json$/, '')}</div>
        </>
      ) : (
        <div className="meas-hint">Zuerst am PC „Lokal im WLAN teilen“ starten und im Tab Sync den QR-Code scannen.</div>
      )}
      {msg && <div className={'sync-msg' + (msg.err ? ' sync-msg--err' : '')} style={{ margin: '10px 0 0', padding: 0, background: 'none' }}>{msg.err ? <CircleAlert size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}{msg.text}</div>}
    </div>
  );
}

function PruefungTab({ plan, setPlan, pcUrl }) {
  const [openId,   setOpenId]   = useState(null);
  const [metaOpen, setMetaOpen] = useState(false);

  const res    = plan.inspResults || {};
  const meta   = { ...inspMetaDef(), ...(plan.inspMeta || {}) };
  const sorted = sortTopo(plan.instances);

  const updMeta = (patch) => setPlan(p => ({ ...p, inspMeta: { ...inspMetaDef(), ...(p.inspMeta || {}), ...patch } }));
  const setRes  = (fn) => setPlan(p => ({ ...p, inspResults: fn(p.inspResults || {}) }));

  const idx = openId ? sorted.findIndex(s => s.inst.id === openId) : -1;
  if (idx >= 0) {
    return (
      <InspDetail
        key={openId}
        plan={plan} inst={sorted[idx].inst} res={res} setRes={setRes}
        pos={idx + 1} total={sorted.length}
        onBack={() => setOpenId(null)}
        onPrev={idx > 0 ? () => setOpenId(sorted[idx - 1].inst.id) : null}
        onNext={idx < sorted.length - 1 ? () => setOpenId(sorted[idx + 1].inst.id) : null}
      />
    );
  }

  const evals    = sorted.map(({ inst }) => evalInst(plan, res, inst));
  const started  = evals.filter(e => e.filled > 0 || e.sichtOk > 0).length;
  const totalBad = evals.reduce((n, e) => n + e.bad + (e.remark === 'bad' ? 1 : 0), 0);

  const metaFields = [
    { key: 'inspector', label: 'Prüfer',                 type: 'text' },
    { key: 'date',      label: 'Datum',                  type: 'date' },
    { key: 'time',      label: 'Uhrzeit',                type: 'time' },
    { key: 'equipment', label: 'Prüfmittel / Messgerät', type: 'text' },
    { key: 'address',   label: 'Adresse',                type: 'text' },
    { key: 'location',  label: 'Ort des Anschlusses',    type: 'text' },
  ];

  return (
    <div className="page">
      <div className="section">
        <button className="collapse-head" onClick={() => setMetaOpen(o => !o)}>
          <span className="section-title" style={{ margin: 0 }}>Prüfungsdetails</span>
          <span className="collapse-sum">{meta.inspector || 'Prüfer fehlt'} · {meta.date}</span>
          <span className="collapse-arrow">{metaOpen ? '▴' : '▾'}</span>
        </button>
        {metaOpen && (
          <div style={{ marginTop: 12 }}>
            {metaFields.map(f => (
              <div key={f.key} className="field-row">
                <label className="field-label">{f.label}</label>
                <input className="field-input" type={f.type} value={meta[f.key] || ''} onChange={e => updMeta({ [f.key]: e.target.value })} />
              </div>
            ))}
            <label className="field-label">Netzform</label>
            <Segmented
              options={[['TN-S', 'TN-S'], ['TN-C-S', 'TN-C-S'], ['TT', 'TT'], ['IT', 'IT']]}
              value={meta.netType || ''}
              onChange={v => updMeta({ netType: meta.netType === v ? '' : v })}
            />
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="notice">Keine Verteiler im Plan.{'\n'}Plan am PC über „Lokales Teilen“ freigeben und im Tab <strong>Sync</strong> den QR-Code scannen.</div>
      ) : (
        <>
          <div className="insp-summary">
            {started}/{sorted.length} Verteiler begonnen · {totalBad ? <span className="txt-bad">{totalBad} Mängel</span> : 'keine Mängel'}
          </div>
          <div className="inst-list">
            {sorted.map(({ inst, depth }, i) => {
              const ev   = evals[i];
              const type = plan.boxTypes.find(b => b.id === instTypeId(inst));
              const ind  = Math.min(depth, 4) * 14;
              return (
                <button
                  key={inst.id}
                  className={'inst-card' + (ev.bad ? ' inst-card--bad' : '')}
                  style={{ marginLeft: ind, width: `calc(100% - ${ind}px)` }}
                  onClick={() => setOpenId(inst.id)}
                >
                  <div className="inst-name">{depth > 0 && <CornerDownRight size={14} className="inline-icon insp-branch" aria-hidden="true" />}{instName(inst)}</div>
                  <div className="inst-meta">
                    <span className="inst-type">{type?.name || '?'}</span>
                    <span className="insp-badges">
                      <span className={'badge' + (ev.sichtOk === SICHT_ITEMS.length ? ' badge--ok' : '')}>Sicht {ev.sichtOk}/{SICHT_ITEMS.length}</span>
                      <span className="badge">{ev.filled} Werte</span>
                      {ev.bad > 0 && <span className="badge badge--bad"><TriangleAlert size={11} aria-hidden="true" />{ev.bad}</span>}
                      {ev.remark && <span className={'badge ' + (ev.remark === 'warn' ? 'badge--warn' : 'badge--bad')}>{ev.remark === 'warn' ? <><TriangleAlert size={11} aria-hidden="true" />Hinweis</> : <><X size={11} aria-hidden="true" />Mangel</>}</span>}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <SendToPc plan={plan} pcUrl={pcUrl} />
          </div>
          <div className="meas-hint" style={{ margin: '0 4px' }}>Das Prüfprotokoll (PDF) wird am PC erstellt.</div>
        </>
      )}
    </div>
  );
}

function InspDetail({ plan, inst, res, setRes, pos, total, onBack, onPrev, onNext }) {
  const rootRef = useRef(null);
  useEffect(() => { rootRef.current?.closest('.app-main')?.scrollTo(0, 0); }, []);

  const ir = irOf(res, inst.id);
  const { type, rcdRows, loopRows } = buildRows(plan, inst);

  const updIR = (patch) => setRes(r => ({ ...r, [inst.id]: { ...irOf(r, inst.id), ...patch } }));
  const updOR = (oid, patch) => setRes(r => {
    const cur = irOf(r, inst.id);
    return { ...r, [inst.id]: { ...cur, outlets: { ...cur.outlets, [oid]: { ...orOf(r, inst.id, oid), ...patch } } } };
  });
  const setSicht = (fn) => setRes(r => {
    const cur = irOf(r, inst.id);
    return { ...r, [inst.id]: { ...cur, sicht: fn(cur.sicht) } };
  });

  // Enter / „Weiter“ auf der Tastatur springt ins nächste Messfeld
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || !e.target.classList?.contains('num-input')) return;
    e.preventDefault();
    const all = [...rootRef.current.querySelectorAll('input.num-input')];
    const i = all.indexOf(e.target);
    if (i >= 0 && i < all.length - 1) all[i + 1].focus(); else e.target.blur();
  };

  const allSichtOk = ir.sicht.every(v => v === true);

  return (
    <div className="page" ref={rootRef} onKeyDown={onKeyDown}>
      <div className="insp-top">
        <button className="btn btn--small btn--secondary" onClick={onBack}>‹ Übersicht</button>
        <span className="insp-pos">{pos} / {total}</span>
      </div>
      <div className="insp-title">{instName(inst)}</div>
      <div className="insp-sub">
        {type?.name || '?'} · Einspeisung {CONN[type?.feedConnector]?.label || type?.feedConnector || ''} {type?.feedAmp || ''}A
      </div>

      {/* ── Sichtprüfung ── */}
      <div className="section">
        <div className="section-head">
          <span className="section-title" style={{ margin: 0 }}>Sichtprüfung</span>
          <button className="link-btn" onClick={() => setSicht(s => s.map(() => (allSichtOk ? null : true)))}>
            {allSichtOk ? 'Zurücksetzen' : 'Alle OK'}
          </button>
        </div>
        <div className="sicht-grid">
          {SICHT_ITEMS.map((label, i) => (
            <button
              key={i}
              className={'sicht-item' + (ir.sicht[i] === true ? ' sicht-item--ok' : '')}
              onClick={() => setSicht(s => s.map((v, k) => (k === i ? (v === true ? null : true) : v)))}
            >
              <span className="sicht-box">{ir.sicht[i] === true ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : null}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Spannungen + Drehfeld ── */}
      <div className="section">
        <div className="section-title">Spannungsmessung (V)</div>
        {VOLT_GROUPS.map((g, gi) => (
          <div key={gi} className="meas-grid">
            {g.map(f => (
              <label key={f.key} className="meas-cell">
                <span className="meas-label">{f.label}</span>
                <NumInput value={ir[f.key]} ok={chk(ir[f.key], f.min, f.max)} onChange={v => updIR({ [f.key]: v })} />
                <span className="meas-hint">{rangeHint(f.min, f.max, 'V')}</span>
              </label>
            ))}
          </div>
        ))}
        <label className="field-label" style={{ marginTop: 8 }}>Drehfeld</label>
        <Segmented
          options={[['rechts', 'Rechts'], ['links', 'Links'], ['', 'nicht geprüft']]}
          value={ir.phaseRot || ''}
          onChange={v => updIR({ phaseRot: v })}
        />
      </div>

      {/* ── Schleife am Eingang ── */}
      <div className="section">
        <div className="section-title">Schleifenimpedanz Eingang</div>
        <div className="meas-grid meas-grid--2">
          <label className="meas-cell">
            <span className="meas-label">Z_s (Ω)</span>
            <NumInput value={ir.zs} onChange={v => updIR({ zs: v })} />
          </label>
          <label className="meas-cell">
            <span className="meas-label">I_k (A)</span>
            <NumInput value={ir.ik} onChange={v => updIR({ ik: v })} />
          </label>
        </div>
        <div className="meas-hint">Nur nötig, wenn die Zuleitung höher abgesichert ist als alle Abgänge.</div>
      </div>

      {/* ── RCD ── */}
      {rcdRows.length > 0 && (
        <div className="section">
          <div className="section-title">RCD-Prüfung</div>
          {rcdRows.map(row => {
            const or = orOf(res, inst.id, row.oid);
            return (
              <div key={row.oid} className="sub-row">
                <div className="sub-head">
                  <span className={'sub-label' + (row.isGroup ? ' sub-label--group' : '')}>{row.label}</span>
                  <span className="meas-hint">{row.prot}</span>
                </div>
                <div className="meas-grid meas-grid--2">
                  <label className="meas-cell">
                    <span className="meas-label">I_Δn (mA)</span>
                    <NumInput value={or.rcdIan} ok={chk(or.rcdIan, row.iAn / 2, row.iAn)} onChange={v => updOR(row.oid, { rcdIan: v })} />
                    <span className="meas-hint">{row.iAn / 2}–{row.iAn} mA</span>
                  </label>
                  <label className="meas-cell">
                    <span className="meas-label">t_A (ms)</span>
                    <NumInput value={or.rcdT1} ok={chk(or.rcdT1, undefined, 300)} onChange={v => updOR(row.oid, { rcdT1: v })} />
                    <span className="meas-hint">≤ 300 ms</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Schleifenimpedanz je Abgang ── */}
      {loopRows.length > 0 && (
        <div className="section">
          <div className="section-title">Schleifenimpedanz & Kurzschluss</div>
          {loopRows.map(row => {
            const or   = orOf(res, inst.id, row.oid);
            const lim  = `Z_s ≤ ${fmtOhm(row.zsLim)} Ω${row.hasRcd ? ' (RCD)' : ''} · I_k ≥ ${row.ikLim} A`;
            const head = (action) => (
              <div className="sub-head">
                <span className="sub-label">{row.label} <span className="meas-hint">{row.sub}</span></span>
                {action}
              </div>
            );

            if (row.kids.length) {
              const v   = kidValues(plan, res, inst, row);
              const okZ = v.zs ? chk(v.zs, undefined, row.zsLim) : null;
              const okI = v.ik ? chk(v.ik, row.ikLim, undefined) : null;
              return (
                <div key={row.oid} className={'sub-row loop-kid' + (okZ === false || okI === false ? ' sub-row--bad' : '')}>
                  {head(null)}
                  <div className="meas-hint"><CornerDownRight size={11} className="inline-icon" aria-hidden="true" />{row.kids.map(instName).join(', ')} · {v.override ? 'am PC nachgetragener Wert' : 'schlechtester Wert aus Unterverteilung'}</div>
                  <div className="kid-vals">
                    Z_s <strong className={okZ === false ? 'txt-bad' : okZ ? 'txt-ok' : ''}>{v.zs || '–'} Ω</strong>
                    {' · '}
                    I_k <strong className={okI === false ? 'txt-bad' : okI ? 'txt-ok' : ''}>{v.ik || '–'} A</strong>
                  </div>
                  <div className="meas-hint">{lim}</div>
                </div>
              );
            }

            if (or.notInUse) {
              return (
                <div key={row.oid} className="sub-row sub-row--off">
                  {head(<button className="link-btn" onClick={() => updOR(row.oid, { notInUse: false })}>Reaktivieren</button>)}
                  <div className="meas-hint">Nicht in Betrieb / nicht gemessen</div>
                </div>
              );
            }

            const offBtn = <button className="link-btn link-btn--muted" onClick={() => updOR(row.oid, { notInUse: true })}>Nicht in Betrieb</button>;

            if (row.is3p) {
              return (
                <div key={row.oid} className="sub-row">
                  {head(offBtn)}
                  <div className="phase-grid">
                    <span />
                    <span className="meas-label">Z_s (Ω)</span>
                    <span className="meas-label">I_k (A)</span>
                    {PHASES.map(ph => (
                      <React.Fragment key={ph}>
                        <span className="phase-label">{ph}</span>
                        <NumInput value={or[`zs${ph}`]} ok={chk(or[`zs${ph}`], undefined, row.zsLim)} onChange={v => updOR(row.oid, { [`zs${ph}`]: v })} />
                        <NumInput value={or[`ik${ph}`]} ok={chk(or[`ik${ph}`], row.ikLim, undefined)} onChange={v => updOR(row.oid, { [`ik${ph}`]: v })} />
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="meas-hint">{lim}</div>
                </div>
              );
            }

            return (
              <div key={row.oid} className="sub-row">
                {head(offBtn)}
                <div className="meas-grid meas-grid--2">
                  <label className="meas-cell">
                    <span className="meas-label">Z_s (Ω)</span>
                    <NumInput value={or.zs} ok={chk(or.zs, undefined, row.zsLim)} onChange={v => updOR(row.oid, { zs: v })} />
                  </label>
                  <label className="meas-cell">
                    <span className="meas-label">I_k (A)</span>
                    <NumInput value={or.ik} ok={chk(or.ik, row.ikLim, undefined)} onChange={v => updOR(row.oid, { ik: v })} />
                  </label>
                </div>
                <div className="meas-hint">{lim}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Bemerkung ── */}
      <div className="section">
        <div className="section-title">Bemerkung / Auflage</div>
        <textarea
          className="field-input"
          rows={3}
          placeholder="Optional: Hinweis oder Mangel eintragen…"
          value={ir.bemerkung || ''}
          onChange={e => updIR({ bemerkung: e.target.value })}
        />
        <div style={{ marginTop: 8 }}>
          <Segmented
            options={[['bad', <><X size={14} aria-hidden="true" />Mangel</>], ['warn', <><TriangleAlert size={14} aria-hidden="true" />Hinweis</>]]}
            value={ir.bemerkungSchwere || 'bad'}
            onChange={v => updIR({ bemerkungSchwere: v })}
          />
        </div>
      </div>

      <div className="insp-nav">
        <button className="btn btn--secondary" disabled={!onPrev} onClick={onPrev || undefined}>‹ Vorheriger</button>
        <button className="btn btn--primary" onClick={onNext || onBack}>{onNext ? 'Nächster ›' : 'Fertig'}</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Sync Tab                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */
function QrScanner({ onResult, onClose }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        const scan = () => {
          if (!active) return;
          const v = videoRef.current, c = canvasRef.current;
          if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
            c.width = v.videoWidth; c.height = v.videoHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code?.data) { onResult(code.data); return; }
          }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      })
      .catch(() => { alert('Kamera nicht verfügbar'); onClose(); });
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div style={{ position:'fixed',inset:0,zIndex:1000,background:'#000',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16 }}>
      <video ref={videoRef} playsInline muted style={{ width:'100%',maxWidth:400,borderRadius:8 }} />
      <canvas ref={canvasRef} style={{ display:'none' }} />
      <div style={{ color:'#aaa',fontSize:13 }}>QR-Code in den Rahmen halten</div>
      <button onClick={onClose} style={{ padding:'10px 32px',background:'#2a3140',border:'none',borderRadius:8,color:'#fff',fontSize:15,cursor:'pointer' }}>Abbrechen</button>
    </div>
  );
}

function SyncTab({ plan, setPlan, server, setServer, token, setToken, pcUrl, setPcUrl }) {
  const [plans,       setPlans]       = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const apiUrl = (path) => server.replace(/\/$/, '') + path;

  const headers = () => {
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const status = (text, isErr = false) => setMsg({ text, err: isErr });

  const fetchPlans = async () => {
    if (!server) return;
    setLoading(true);
    try {
      const r = await fetch(apiUrl('/api/plans'), { headers: headers() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPlans(await r.json());
      setMsg(null);
    } catch (e) {
      status('Verbindung fehlgeschlagen: ' + e.message, true);
      setPlans(null);
    } finally {
      setLoading(false);
    }
  };

  const push = async () => {
    if (!server) return;
    setLoading(true);
    try {
      const id = plan._syncId || uid() + uid();
      const body = JSON.stringify({ ...plan, _syncId: id });
      const r = await fetch(apiUrl(`/api/plans/${id}`), {
        method: 'PUT', headers: headers(), body,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPlan(p => ({ ...p, _syncId: id }));
      status('Hochgeladen: ' + (plan.meta.production || id));
      fetchPlans();
    } catch (e) {
      status('Upload fehlgeschlagen: ' + e.message, true);
    } finally {
      setLoading(false);
    }
  };

  const pull = async (id) => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/plans/${id}`), { headers: headers() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!confirmReplace(plan)) { status('Laden abgebrochen', true); return; }
      setPlan(migratePlan(data));
      status('Geladen: ' + (data.meta?.production || id));
    } catch (e) {
      status('Download fehlgeschlagen: ' + e.message, true);
    } finally {
      setLoading(false);
    }
  };

  const del = async (id, name) => {
    if (!window.confirm(`"${name}" auf dem Server löschen?`)) return;
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/plans/${id}`), { method: 'DELETE', headers: headers() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      status('Gelöscht: ' + name);
      fetchPlans();
    } catch (e) {
      status('Fehler: ' + e.message, true);
    } finally {
      setLoading(false);
    }
  };

  const newLocal = () => {
    if (window.confirm('Lokalen Plan verwerfen und neu beginnen?')) {
      setPlan(newPlan());
      setMsg({ text: 'Neuer Plan erstellt.', err: false });
    }
  };

  const handleQr = async (url) => {
    setShowScanner(false);
    setLoading(true);
    try {
      // Direct plan download (from Desktop local-share)
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (data._format === 'stromplaner') {
        if (!confirmReplace(plan)) { status('Import abgebrochen', true); return; }
        setPlan(migratePlan(data));
        setPcUrl(url);
        status('Plan geladen: ' + (data.meta?.production || url));
      } else {
        // Treat as server URL
        setServer(url.replace(/\/+$/, ''));
        status('Server-URL gesetzt');
      }
    } catch {
      // Fallback: use as server URL
      setServer(url.replace(/\/+$/, ''));
      status('Server-URL gesetzt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    {showScanner && <QrScanner onResult={handleQr} onClose={() => setShowScanner(false)} />}
    <div className="page">
      {/* ── Server config ── */}
      <div className="section">
        <div className="section-title">Sync-Server</div>
        <button
          className="btn btn--secondary"
          style={{ width: '100%', marginBottom: 12 }}
          onClick={() => setShowScanner(true)}
        ><QrCode size={18} aria-hidden="true" />QR-Code scannen</button>
        <label className="field-label">Server-URL</label>
        <input
          className="field-input"
          type="url"
          placeholder="http://192.168.1.10:3001"
          value={server}
          onChange={e => setServer(e.target.value)}
        />
        <label className="field-label" style={{ marginTop: 12 }}>API-Token (optional)</label>
        <input
          className="field-input"
          type="password"
          placeholder="Token leer lassen wenn kein Auth"
          value={token}
          onChange={e => setToken(e.target.value)}
        />
        <button
          className="btn btn--primary"
          style={{ marginTop: 12, width: '100%' }}
          disabled={!server || loading}
          onClick={fetchPlans}
        >
          {loading ? 'Verbinde…' : 'Verbinden & Pläne laden'}
        </button>
      </div>

      {/* ── Current plan actions ── */}
      <div className="section">
        <div className="section-title">Aktueller Plan</div>
        <div className="stat-row">
          <span>Veranstaltung</span>
          <strong>{plan.meta.production || '—'}</strong>
        </div>
        <div className="stat-row">
          <span>Instanzen</span>
          <strong>{plan.instances.length}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn--primary" style={{ flex: 1 }} disabled={!server || loading} onClick={push}>
            <Upload size={16} aria-hidden="true" />Hochladen
          </button>
          <button className="btn btn--secondary" style={{ flex: 1 }} onClick={newLocal}>
            Neu
          </button>
        </div>
      </div>

      <SendToPc plan={plan} pcUrl={pcUrl} />

      {/* ── Status message ── */}
      {msg && <div className={'sync-msg' + (msg.err ? ' sync-msg--err' : '')}>{msg.err ? <CircleAlert size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}{msg.text}</div>}

      {/* ── Server plans list ── */}
      {plans !== null && (
        <div className="section">
          <div className="section-title">Pläne auf dem Server ({plans.length})</div>
          {plans.length === 0 && <div className="empty-hint">Keine Pläne auf dem Server.</div>}
          {plans.map(p => (
            <div key={p.id} className="plan-row">
              <div className="plan-row-info">
                <span className="plan-name">{p.name || p.id}</span>
                <span className="plan-date">{p.date ? p.date.slice(0, 10) : ''}</span>
              </div>
              <div className="plan-row-actions">
                <button className="btn btn--small btn--primary" disabled={loading} onClick={() => pull(p.id)}>
                  <Download size={14} aria-hidden="true" />Laden
                </button>
                <button className="btn btn--small btn--danger" disabled={loading} onClick={() => del(p.id, p.name)} aria-label="Vom Server löschen">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
