import React, { useState, useEffect, useRef, useCallback } from 'react';

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
  MC:      { label: 'Multicore',       amp: 16,   phases: 1 },
  SCHUKO:  { label: 'Schuko',          amp: 16,   phases: 1 },
};

const uid  = () => Math.random().toString(36).slice(2, 9);
const now  = () => new Date().toISOString().slice(0, 10);

const LS_KEY     = 'sp_mobile_v1';
const SERVER_KEY = 'sp_sync_server';
const TOKEN_KEY  = 'sp_sync_token';

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
const getConsumer = (inst, outId) => inst.consumers?.find(c => c.outId === outId);

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Root                                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [tab,     setTab]     = useState('steckplan');
  const [plan,    setPlan]    = useState(null);
  const [server,  setServer]  = useState(() => localStorage.getItem(SERVER_KEY) || '');
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY)  || '');

  /* load */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      setPlan(raw ? JSON.parse(raw) : newPlan());
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

  if (!plan) return <div className="loading">Laden…</div>;

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">⚡</span>
        <span className="header-title">Stromplaner</span>
        {plan.meta.production && (
          <span className="header-sub">{plan.meta.production}</span>
        )}
      </header>

      <main className="app-main">
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
          />
        )}
      </main>

      <nav className="tab-bar">
        {[
          { id: 'steckplan', icon: '🔌', label: 'Steckplan' },
          { id: 'projekt',   icon: '📋', label: 'Projekt'   },
          { id: 'sync',      icon: '☁️',  label: 'Sync'      },
        ].map(t => (
          <button
            key={t.id}
            className={'tab-btn' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
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
  // modal: null | {kind:'add'} | {kind:'inst', instId} | {kind:'pick', instId, outId}

  const hasLibrary = plan.boxTypes.length > 0;

  const addInstance = (boxId, name) => {
    const inst = { id: uid(), instName: name, box: boxId, consumers: [] };
    setPlan(p => ({ ...p, instances: [...p.instances, inst] }));
    setModal({ kind: 'inst', instId: inst.id });
  };

  const updateConsumer = (instId, outId, loadId) => {
    setPlan(p => {
      const instances = p.instances.map(inst => {
        if (inst.id !== instId) return inst;
        const consumers = inst.consumers.filter(c => c.outId !== outId);
        if (loadId) consumers.push({ id: uid(), outId, loadId });
        return { ...inst, consumers };
      });
      return { ...p, instances };
    });
  };

  const deleteInstance = (instId) => {
    setPlan(p => ({ ...p, instances: p.instances.filter(i => i.id !== instId) }));
    setModal(null);
  };

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
          const bt = getBoxType(plan, inst.box);
          const assigned = inst.consumers?.length || 0;
          const total    = bt?.outlets?.length || 0;
          return (
            <button
              key={inst.id}
              className="inst-card"
              onClick={() => setModal({ kind: 'inst', instId: inst.id })}
            >
              <div className="inst-name">{inst.instName || '(kein Name)'}</div>
              <div className="inst-meta">
                <span className="inst-type">{bt?.name || inst.box}</span>
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
          boxTypes={plan.boxTypes}
          onAdd={addInstance}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Instance detail sheet ── */}
      {modal?.kind === 'inst' && (() => {
        const inst = plan.instances.find(i => i.id === modal.instId);
        if (!inst) return null;
        const bt = getBoxType(plan, inst.box);
        return (
          <InstSheet
            inst={inst} bt={bt} plan={plan}
            onPickLoad={(outId) => setModal({ kind: 'pick', instId: inst.id, outId })}
            onRename={(name) => {
              setPlan(p => ({ ...p, instances: p.instances.map(i => i.id === inst.id ? { ...i, instName: name } : i) }));
            }}
            onDelete={() => deleteInstance(inst.id)}
            onClose={() => setModal(null)}
          />
        );
      })()}

      {/* ── Consumer picker sheet ── */}
      {modal?.kind === 'pick' && (() => {
        const inst = plan.instances.find(i => i.id === modal.instId);
        const bt   = getBoxType(plan, inst?.box);
        const out  = bt?.outlets?.find(o => o.outId === modal.outId || o.id === modal.outId);
        const cur  = getConsumer(inst, modal.outId);
        return (
          <PickerSheet
            loads={plan.loads}
            outlet={out}
            currentLoadId={cur?.loadId}
            onPick={(loadId) => {
              updateConsumer(modal.instId, modal.outId, loadId);
              setModal({ kind: 'inst', instId: modal.instId });
            }}
            onClose={() => setModal({ kind: 'inst', instId: modal.instId })}
          />
        );
      })()}
    </div>
  );
}

/* ── Add instance modal ──────────────────────────────────────────────────── */
function AddInstModal({ boxTypes, onAdd, onClose }) {
  const [boxId, setBoxId] = useState(boxTypes[0]?.id || '');
  const [name,  setName]  = useState('');

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--center" onClick={e => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">Neuer Verteiler</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
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
            placeholder="z.B. Bühne Links"
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
function InstSheet({ inst, bt, plan, onPickLoad, onRename, onDelete, onClose }) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(inst.instName);

  const commitRename = () => {
    setEditing(false);
    if (nameVal !== inst.instName) onRename(nameVal);
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
              {inst.instName || '(kein Name)'} ✏️
            </span>
          )}
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-sub">{bt?.name} · {bt?.feedConnector} {bt?.feedAmp}A</div>

        <div className="outlet-list">
          {(bt?.outlets || []).map(out => {
            const cons = getConsumer(inst, out.id);
            const load = cons ? getLoad(plan, cons.loadId) : null;
            return (
              <button
                key={out.id}
                className={'outlet-row' + (load ? ' outlet-row--filled' : '')}
                onClick={() => onPickLoad(out.id)}
              >
                <div className="outlet-info">
                  <span className="outlet-label">{out.label}</span>
                  <span className="outlet-type">{CONN[out.connector]?.label || out.connector}</span>
                </div>
                <div className="outlet-consumer">
                  {load
                    ? <span className="consumer-name">{load.name}</span>
                    : <span className="consumer-empty">Leer</span>
                  }
                  <span className="outlet-arrow">›</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="sheet-footer sheet-footer--danger">
          <button className="btn btn--danger" onClick={() => {
            if (window.confirm(`"${inst.instName}" wirklich löschen?`)) onDelete();
          }}>
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Consumer picker sheet ───────────────────────────────────────────────── */
function PickerSheet({ loads, outlet, currentLoadId, onPick, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = loads.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--bottom sheet--tall" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span className="sheet-title">Verbraucher — {outlet?.label}</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
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
          <button
            className={'picker-item' + (!currentLoadId ? ' picker-item--selected' : '')}
            onClick={() => onPick(null)}
          >
            <span className="picker-name">Leer</span>
          </button>
          {filtered.map(l => (
            <button
              key={l.id}
              className={'picker-item' + (l.id === currentLoadId ? ' picker-item--selected' : '')}
              onClick={() => onPick(l.id)}
            >
              <span className="picker-name">{l.name}</span>
              <span className="picker-meta">{l.watt} W</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="picker-empty">Keine Treffer</div>}
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
/*  Sync Tab                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */
function SyncTab({ plan, setPlan, server, setServer, token, setToken }) {
  const [plans,   setPlans]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState('');

  const apiUrl = (path) => server.replace(/\/$/, '') + path;

  const headers = () => {
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const status = (text, isErr = false) => setMsg((isErr ? '⚠️ ' : '✓ ') + text);

  const fetchPlans = async () => {
    if (!server) return;
    setLoading(true);
    try {
      const r = await fetch(apiUrl('/api/plans'), { headers: headers() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPlans(await r.json());
      setMsg('');
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
      setPlan(data);
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
      setMsg('Neuer Plan erstellt.');
    }
  };

  return (
    <div className="page">
      {/* ── Server config ── */}
      <div className="section">
        <div className="section-title">Sync-Server</div>
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
            ↑ Hochladen
          </button>
          <button className="btn btn--secondary" style={{ flex: 1 }} onClick={newLocal}>
            Neu
          </button>
        </div>
      </div>

      {/* ── Status message ── */}
      {msg && <div className={'sync-msg' + (msg.startsWith('⚠️') ? ' sync-msg--err' : '')}>{msg}</div>}

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
                  ↓ Laden
                </button>
                <button className="btn btn--small btn--danger" disabled={loading} onClick={() => del(p.id, p.name)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
