import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

/* ============================================================================
   STROMPLANER v4
   + Mehrere Hauptanschlüsse, Kästen optional zuweisbar
   + Multicore: konfigurierbare Steckplatzanzahl, Phase rotiert automatisch
   + Verbraucher-Dropdown: Inline-Textsuche direkt im Trigger
   + Autosave via localStorage
   ============================================================================ */

const PHASES = ["L1","L2","L3"];
const VOLT   = 230;
const LS_KEY = "stromplaner_autosave";

const CONN = {
  CEE16:   { label:"16A 3LNPE 400V",  amp:16,  phases:3 },
  CEE32:   { label:"32A 3LNPE 400V",  amp:32,  phases:3 },
  CEE63:   { label:"63A 3LNPE 400V",  amp:63,  phases:3 },
  CEE125:  { label:"125A 3LNPE 400V", amp:125, phases:3 },
  CEE16_1: { label:"16A 1LNP 230V",   amp:16,  phases:1 },
  CEE32_1: { label:"32A 1LNP 230V",   amp:32,  phases:1 },
  PL125:   { label:"125A Powerlock",  amp:125, phases:3 },
  PL200:   { label:"200A Powerlock",  amp:200, phases:3 },
  PL400:   { label:"400A Powerlock",  amp:400, phases:3 },
  MC:      { label:"Multicore",       amp:16,  phases:1, isMulticore:true },
  SCHUKO:  { label:"Schuko",          amp:16,  phases:1 },
};
// Stecker-Familien: Adapter nur innerhalb derselben Familie erlaubt
const CONN_FAMILY = {
  CEE16:"CEE3P", CEE32:"CEE3P", CEE63:"CEE3P", CEE125:"CEE3P",
  CEE16_1:"CEE1P", CEE32_1:"CEE1P",
  PL125:"PL", PL200:"PL", PL400:"PL",
  MC:"MC", SCHUKO:"SCHUKO",
};

const BREAKER_TYPES    = ["B","C","D","K"];
const PROTECTION_TYPES = ["LS","RCBO","Keine"];

/* ── Leitungsdimensionierung / Spannungsfall ────────────────────────────── */
const KAPPA_CU     = 56;   // m/(Ω·mm²), Kupfer 20 °C

// H07RN-F Nennstrom frei in Luft (Basis, DIN VDE 0298-4 Tafel 11)
const CABLE_CS_H07 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95];
const I_CAP_H07 = {1.5:23,2.5:30,4:38,6:48,10:64,16:84,25:109,35:135,50:162,70:202,95:245};

// Korrekturfaktoren DIN VDE 0298-4 (PVC 70 °C)
const F_TEMP = {10:1.22,15:1.17,20:1.12,25:1.06,30:1.00,35:0.94,40:0.87,45:0.79,50:0.71};
const F_ADERN = {2:1.00,3:0.70,4:0.65,5:0.60,6:0.57};
const F_LAGEN = {1:0.85,2:0.65,3:0.45};
const F_HAE_EINL   = {1:1.00,2:0.85,3:0.79,4:0.75,5:0.73,6:0.72,7:0.72,8:0.71,9:0.70,10:0.70};
const F_HAE_GEBUND = {1:1.00,2:0.80,3:0.75,4:0.70,5:0.68,6:0.65,7:0.65,8:0.62,9:0.62,10:0.60};

// Belastbarkeit nach Querschnitt + Korrekturfaktoren (→ { base, fTotal, izul })
const calcDim = (cableA, fTemp, fAdern, fLagen, fArt, fN) => {
  const base = I_CAP_H07[+cableA]; if(!base) return null;
  let f = 1;
  if(fTemp  && F_TEMP[+fTemp])   f *= F_TEMP[+fTemp];
  if(fAdern && F_ADERN[+fAdern]) f *= F_ADERN[+fAdern];
  if(fLagen && F_LAGEN[+fLagen]) f *= F_LAGEN[+fLagen];
  if(fArt && fN) {
    const tbl = fArt==="einl" ? F_HAE_EINL : F_HAE_GEBUND;
    if(tbl[Math.min(+fN,10)]) f *= tbl[Math.min(+fN,10)];
  }
  return { base, fTotal:round2(f), izul:round2(base*f) };
};

const calcVoltDrop = (I, l, A, cosPhi, threePhase) => {
  if(!+l||!+A||!+cosPhi) return null;
  const fac = threePhase ? Math.sqrt(3) : 2;
  const duV = fac * (+I) * (+l) * (+cosPhi) / (KAPPA_CU * (+A));
  return { V: round2(duV), pct: round2(duV / 230 * 100) };
};
const minCsVoltDrop = (I, l, cosPhi, threePhase, maxPct=3) => {
  if(!+l||!+cosPhi||!+I) return null;
  const fac = threePhase ? Math.sqrt(3) : 2;
  return round2(fac * (+I) * (+l) * (+cosPhi) / (KAPPA_CU * (maxPct/100) * 230));
};

const CONN_SORTED_ENTRIES = Object.entries(CONN).sort((a,b)=>a[1].label.localeCompare(b[1].label,"de"));

const CHANGELOG = {
  "1.0.4": [
    "Changelog-Popup erscheint jetzt zuverlässig nach Updates",
  ],
  "1.0.3": [
    "Intro-Animation mit Video und Sound beim Start",
    "Spendenbutton (☕) im Header – GitHub Sponsors",
    "Bulk-Add für Ausgänge: Phasenrotation & RCD-Gruppe wählbar",
    "Alle Kästen auf einmal löschen (Konfiguration)",
    "Alle Kasten-Typen auf einmal löschen",
    "Leitungsberechnungen werden beim JSON-Import jetzt korrekt wiederhergestellt",
  ],
};

const downloadJSON = (data, filename) => {
  const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
};

const is3ph        = (c) => (CONN[c]?.phases||1)===3;
const isMulticore  = (c) => !!CONN[c]?.isMulticore;
const uid          = () => Math.random().toString(36).slice(2,9);
const clone        = (x) => JSON.parse(JSON.stringify(x));
const round2       = (n) => Math.round((n+Number.EPSILON)*100)/100;
const alphaSort    = (arr,key) => [...arr].sort((a,b)=>(a[key]||"").localeCompare(b[key]||"","de",{numeric:true,sensitivity:"base"}));
const sortOutlets  = (outlets) => [...outlets].sort((a,b)=>{
  const as=a.connector==="SCHUKO"?0:1, bs=b.connector==="SCHUKO"?0:1;
  if(as!==bs) return as-bs;
  return a.label.localeCompare(b.label,"de",{numeric:true});
});

/* ── Migration ─────────────────────────────────────────────────────────── */
const migrateOutlet = (o, idx) => ({
  ...o,
  phase:      o.phase      || (is3ph(o.connector) ? "L1L2L3" : PHASES[idx%3]),
  breaker:    o.breaker    || "C",
  protection: (o.protection==="RCD") ? "Keine" : (o.protection || (o.connector==="SCHUKO"||o.connector==="MC" ? "RCBO" : "LS")),
  rcdId:      o.rcdId ?? null,
  // Multicore: number of slots (default 6 if not set)
  mcSlots:    isMulticore(o.connector) ? (o.mcSlots||6) : undefined,
});
const migrateBoxType = (bt) => {
  // Auto-migrate: old protection:"RCD" outlets → RCD-group object + protection:"Keine"
  let rcds = bt.rcds ? [...bt.rcds] : [];
  const rcdMigMap = {};
  bt.outlets.forEach(o => {
    if (o.protection === "RCD" && !o.rcdId) {
      const newId = uid();
      rcds.push({ id: newId, label: o.label + " RCD", mA: 30 });
      rcdMigMap[o.id] = newId;
    }
  });
  const outlets = bt.outlets.map((o,i) => {
    const extra = rcdMigMap[o.id] ? { rcdId: rcdMigMap[o.id] } : {};
    return migrateOutlet({...o,...extra}, i);
  });
  return { ...bt, rcds, outlets };
};
const migrateInstance = (i) => ({ mainConnectionId: null, ...i });

/* ── Defaults ───────────────────────────────────────────────────────────── */
const RAW_BOX_TYPES = [{"id":"1B","name":"Kasten 1B","feedConnector":"CEE32","feedAmp":32,"outlets":[{"id":"o1","label":"16A-1","connector":"CEE16","amp":16},{"id":"o2","label":"32A-1","connector":"CEE32","amp":32},{"id":"o3","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o4","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o5","label":"Schuko 3","connector":"SCHUKO","amp":16}]},{"id":"2","name":"Kasten 2","feedConnector":"CEE63","feedAmp":63,"outlets":[{"id":"o1","label":"32A-1","connector":"CEE32","amp":32},{"id":"o2","label":"32A-2","connector":"CEE32","amp":32},{"id":"o3","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o4","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o5","label":"Schuko 3","connector":"SCHUKO","amp":16},{"id":"o6","label":"Schuko 4","connector":"SCHUKO","amp":16},{"id":"o7","label":"Schuko 5","connector":"SCHUKO","amp":16},{"id":"o8","label":"Schuko 6","connector":"SCHUKO","amp":16},{"id":"o9","label":"Schuko 7","connector":"SCHUKO","amp":16},{"id":"o10","label":"Schuko 8","connector":"SCHUKO","amp":16},{"id":"o11","label":"Schuko 9","connector":"SCHUKO","amp":16}]},{"id":"3","name":"Kasten 3","feedConnector":"CEE63","feedAmp":63,"outlets":[{"id":"o1","label":"32A-1","connector":"CEE32","amp":32},{"id":"o2","label":"32A-2","connector":"CEE32","amp":32},{"id":"o3","label":"32A-3","connector":"CEE32","amp":32},{"id":"o4","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o5","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o6","label":"Schuko 3","connector":"SCHUKO","amp":16}]},{"id":"4","name":"Kasten 4","feedConnector":"CEE63","feedAmp":63,"outlets":[{"id":"o1","label":"32A-1","connector":"CEE32","amp":32},{"id":"o2","label":"63A-1","connector":"CEE63","amp":63},{"id":"o3","label":"63A-2","connector":"CEE63","amp":63},{"id":"o4","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o5","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o6","label":"Schuko 3","connector":"SCHUKO","amp":16}]},{"id":"5","name":"Kasten 5","feedConnector":"CEE32","feedAmp":32,"outlets":[{"id":"o1","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o2","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o3","label":"Schuko 3","connector":"SCHUKO","amp":16},{"id":"o4","label":"Schuko 4","connector":"SCHUKO","amp":16},{"id":"o5","label":"Schuko 5","connector":"SCHUKO","amp":16},{"id":"o6","label":"Schuko 6","connector":"SCHUKO","amp":16},{"id":"o7","label":"Schuko 7","connector":"SCHUKO","amp":16},{"id":"o8","label":"Schuko 8","connector":"SCHUKO","amp":16},{"id":"o9","label":"Schuko 9","connector":"SCHUKO","amp":16},{"id":"o10","label":"Schuko 10","connector":"SCHUKO","amp":16},{"id":"o11","label":"Schuko 11","connector":"SCHUKO","amp":16},{"id":"o12","label":"Schuko 12","connector":"SCHUKO","amp":16}]},{"id":"5H","name":"Kasten 5H","feedConnector":"CEE32","feedAmp":32,"outlets":[{"id":"o1","label":"Multicore 1","connector":"MC","amp":16},{"id":"o2","label":"Multicore 2","connector":"MC","amp":16}]},{"id":"6","name":"Kasten 6","feedConnector":"CEE32","feedAmp":32,"outlets":[{"id":"o1","label":"16A 1ph-1","connector":"CEE16_1","amp":16},{"id":"o2","label":"16A 1ph-2","connector":"CEE16_1","amp":16},{"id":"o3","label":"16A 1ph-3","connector":"CEE16_1","amp":16},{"id":"o4","label":"32A 1ph-1","connector":"CEE32_1","amp":32},{"id":"o5","label":"32A 1ph-2","connector":"CEE32_1","amp":32},{"id":"o6","label":"32A 1ph-3","connector":"CEE32_1","amp":32},{"id":"rqq44ow","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"0u1pt1i","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"tv5n2sc","label":"Schuko 3","connector":"SCHUKO","amp":16}]},{"id":"9","name":"Kasten 9","feedConnector":"CEE32","feedAmp":32,"outlets":[{"id":"o1","label":"16A-1","connector":"CEE16","amp":16},{"id":"o2","label":"16A-2","connector":"CEE16","amp":16},{"id":"o3","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o4","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o5","label":"Schuko 3","connector":"SCHUKO","amp":16}]},{"id":"11B","name":"Kasten 11B","feedConnector":"PL400","feedAmp":400,"outlets":[{"id":"o1","label":"63A-1","connector":"CEE63","amp":63},{"id":"o2","label":"63A-2","connector":"CEE63","amp":63},{"id":"o3","label":"63A-3","connector":"CEE63","amp":63},{"id":"o4","label":"63A-4","connector":"CEE63","amp":63},{"id":"o5","label":"63A-5","connector":"CEE63","amp":63},{"id":"o6","label":"63A-6","connector":"CEE63","amp":63}]},{"id":"11D","name":"Kasten 11D","feedConnector":"PL400","feedAmp":400,"outlets":[{"id":"o1","label":"32A-1","connector":"CEE32","amp":32},{"id":"o2","label":"16A-1","connector":"CEE16","amp":16},{"id":"o3","label":"63A-1","connector":"CEE63","amp":63},{"id":"o4","label":"63A-2","connector":"CEE63","amp":63},{"id":"o5","label":"63A-3","connector":"CEE63","amp":63},{"id":"o6","label":"63A-4","connector":"CEE63","amp":63},{"id":"o7","label":"63A-5","connector":"CEE63","amp":63},{"id":"o8","label":"125A-1","connector":"CEE125","amp":125},{"id":"o9","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o10","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o11","label":"Schuko 3","connector":"SCHUKO","amp":16}]},{"id":"12","name":"Kasten 12","feedConnector":"PL400","feedAmp":400,"outlets":[{"id":"o1","label":"Powerlock 1","connector":"PL400","amp":400},{"id":"o2","label":"Powerlock 2","connector":"PL400","amp":400},{"id":"o3","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o4","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o5","label":"Schuko 3","connector":"SCHUKO","amp":16}]},{"id":"14","name":"Kasten 14","feedConnector":"CEE125","feedAmp":125,"outlets":[{"id":"o1","label":"16A-1","connector":"CEE16","amp":16},{"id":"o2","label":"16A-2","connector":"CEE16","amp":16},{"id":"o3","label":"16A-3","connector":"CEE16","amp":16},{"id":"o4","label":"32A-1","connector":"CEE32","amp":32},{"id":"o5","label":"32A-2","connector":"CEE32","amp":32},{"id":"o6","label":"32A-3","connector":"CEE32","amp":32},{"id":"o7","label":"63A-1","connector":"CEE63","amp":63},{"id":"o8","label":"63A-2","connector":"CEE63","amp":63},{"id":"o9","label":"125A-1","connector":"CEE125","amp":125},{"id":"o10","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o11","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o12","label":"Schuko 3","connector":"SCHUKO","amp":16}]},{"id":"15","name":"Kasten 15","feedConnector":"PL400","feedAmp":400,"outlets":[{"id":"o1","label":"16A-1","connector":"CEE16","amp":16},{"id":"o2","label":"16A-2","connector":"CEE16","amp":16},{"id":"o3","label":"32A-1","connector":"CEE32","amp":32},{"id":"o4","label":"32A-2","connector":"CEE32","amp":32},{"id":"o5","label":"63A-1","connector":"CEE63","amp":63},{"id":"o6","label":"63A-2","connector":"CEE63","amp":63},{"id":"o7","label":"125A-1","connector":"CEE125","amp":125},{"id":"o8","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o9","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o10","label":"Schuko 3","connector":"SCHUKO","amp":16},{"id":"o11","label":"Schuko 4","connector":"SCHUKO","amp":16},{"id":"o12","label":"Schuko 5","connector":"SCHUKO","amp":16},{"id":"o13","label":"Schuko 6","connector":"SCHUKO","amp":16}]},{"id":"16","name":"Kasten 16","feedConnector":"CEE63","feedAmp":63,"outlets":[{"id":"o1","label":"32A-1","connector":"CEE32","amp":32},{"id":"o2","label":"Multicore 1","connector":"MC","amp":16},{"id":"o3","label":"Multicore 2","connector":"MC","amp":16},{"id":"o4","label":"Multicore 3","connector":"MC","amp":16},{"id":"o5","label":"Multicore 4","connector":"MC","amp":16},{"id":"o6","label":"Multicore 5","connector":"MC","amp":16},{"id":"o7","label":"Multicore 6","connector":"MC","amp":16},{"id":"o8","label":"Schuko 1","connector":"SCHUKO","amp":16},{"id":"o9","label":"Schuko 2","connector":"SCHUKO","amp":16},{"id":"o10","label":"Schuko 3","connector":"SCHUKO","amp":16},{"id":"o11","label":"Schuko 4 ","connector":"SCHUKO","amp":16},{"id":"o12","label":"Schuko 5","connector":"SCHUKO","amp":16},{"id":"o13","label":"Schuko 6","connector":"SCHUKO","amp":16},{"id":"znxv8pz","label":"Schuko 7","connector":"SCHUKO","amp":16},{"id":"i1xlsle","label":"Schuko 8","connector":"SCHUKO","amp":16},{"id":"4fqlklc","label":"Schuko 9","connector":"SCHUKO","amp":16},{"id":"96fr8el","label":"Schuko 10","connector":"SCHUKO","amp":16},{"id":"cvcgqk1","label":"Schuko 11","connector":"SCHUKO","amp":16},{"id":"7d82nxe","label":"Schuko 12","connector":"SCHUKO","amp":16},{"id":"zswlgfj","label":"Schuko 13 ","connector":"SCHUKO","amp":16},{"id":"6w8byr8","label":"Schuko 14","connector":"SCHUKO","amp":16},{"id":"ou35m6j","label":"Schuko 15","connector":"SCHUKO","amp":16},{"id":"qu2ozpk","label":"Schuko 16","connector":"SCHUKO","amp":16},{"id":"ll7ccva","label":"Schuko 17","connector":"SCHUKO","amp":16},{"id":"2dqxvx7","label":"Schuko 18","connector":"SCHUKO","amp":16},{"id":"jl3qvov","label":"Schuko 19","connector":"SCHUKO","amp":16},{"id":"s8ad3ne","label":"Schuko 20","connector":"SCHUKO","amp":16},{"id":"2nn1tw1","label":"Schuko 21","connector":"SCHUKO","amp":16},{"id":"6dhn8ba","label":"Schuko 22","connector":"SCHUKO","amp":16},{"id":"jozunsr","label":"Schuko 23","connector":"SCHUKO","amp":16},{"id":"yl20d3y","label":"Schuko 24","connector":"SCHUKO","amp":16},{"id":"akei2m4","label":"Schuko 25","connector":"SCHUKO","amp":16},{"id":"4k5buks","label":"Schuko 26","connector":"SCHUKO","amp":16},{"id":"b7e5ybx","label":"Schuko 27","connector":"SCHUKO","amp":16}]}]
;
const DEFAULT_BOX_TYPES = RAW_BOX_TYPES.map(migrateBoxType);
const DEFAULT_LOADS = [];
const DEFAULT_META = {
  production:"Veranstaltung 2026", creator:"", version:"1",
  date: new Date().toISOString().slice(0,10),
};

/* ── Helpers ────────────────────────────────────────────────────────────── */
// For a multicore outlet, generate its slot options with auto-phase
const mcSlotOptions = (outlet) => {
  const n = outlet.mcSlots || 6;
  return Array.from({length:n},(_,i)=>({
    slotNum: i+1,
    label:   `Steckplatz ${i+1}`,
    phase:   PHASES[i%3],
  }));
};

/* ══════════════════════════════════════════════════════════════════════════
   INLINE SEARCH SELECT – typing directly in the trigger
══════════════════════════════════════════════════════════════════════════ */
function InlineSelect({ options, value, onChange, placeholder, style }) {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState("");
  const [pos,    setPos]    = useState({top:0,left:0,width:280});
  const trigRef  = useRef(null);
  const inputRef = useRef(null);
  const wrapRef  = useRef(null);

  const selected = options.find(o=>o.value===value);

  // Close on outside click
  useEffect(()=>{
    const h=(e)=>{ if(wrapRef.current&&!wrapRef.current.contains(e.target)) close(); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);
  // Close on scroll (dropdown is fixed, trigger moves away)
  useEffect(()=>{
    if(!open) return;
    const onScroll=()=>close();
    window.addEventListener("scroll",onScroll,true);
    return ()=>window.removeEventListener("scroll",onScroll,true);
  },[open]);

  const open_ = ()=>{
    if(trigRef.current){
      const r=trigRef.current.getBoundingClientRect();
      const spaceBelow=window.innerHeight-r.bottom;
      const dropH=Math.min(options.length*32+60,340);
      // position:fixed → viewport coords, no scroll offset
      const top=spaceBelow<dropH ? r.top-dropH-4 : r.bottom+2;
      const dropW=Math.max(r.width,280);
      const left=Math.min(r.left, window.innerWidth-dropW-8);
      setPos({top,left:Math.max(left,4),width:dropW});
    }
    setOpen(true);
    setQuery("");
    setTimeout(()=>inputRef.current?.focus(),30);
  };
  const close = ()=>{ setOpen(false); setQuery(""); };
  const pick  = (v)=>{ onChange(v); close(); };

  const filtered = query
    ? options.filter(o=>o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={wrapRef} style={{position:"relative",...style}}>
      {/* Trigger: shows selected label or placeholder; click opens dropdown */}
      <div ref={trigRef}
        style={{...S.inputSm,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",minHeight:30,userSelect:"none"}}
        onClick={open_}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,color:selected?"#e8eaed":"#666"}}>
          {selected ? selected.label : (placeholder||"— wählen —")}
        </span>
        <span style={{fontSize:10,marginLeft:4,color:"#666"}}>{open?"▲":"▼"}</span>
      </div>

      {open && (
        <div style={{...S.dropdown,top:pos.top,left:pos.left,width:pos.width}}>
          {/* Inline search field */}
          <input ref={inputRef}
            style={{...S.inputSm,width:"100%",boxSizing:"border-box",marginBottom:4}}
            placeholder="Verbraucher suchen…"
            value={query}
            onChange={e=>setQuery(e.target.value)}
            onClick={e=>e.stopPropagation()}
            onKeyDown={e=>{ if(e.key==="Escape") close(); if(e.key==="Enter"&&filtered.length===1) pick(filtered[0].value); }}
          />
          <div style={S.dropdownList}>
            {filtered.map(o=>(
              <div key={o.value}
                style={{...S.dropdownItem,...(o.value===value?S.dropdownItemActive:{})}}
                onClick={()=>pick(o.value)}>
                {o.label}
              </div>
            ))}
            {filtered.length===0&&<div style={{...S.dropdownItem,color:"#666"}}>Keine Treffer</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* Plain FilterSelect for non-load dropdowns (outlet picker etc.) */
function FilterSelect({ options, value, onChange, placeholder, style }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const [pos,   setPos]   = useState({top:0,left:0,width:280});
  const trigRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(()=>{
    const h=(e)=>{ if(wrapRef.current&&!wrapRef.current.contains(e.target)) close(); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);
  // Close on scroll (dropdown is fixed, trigger moves away)
  useEffect(()=>{
    if(!open) return;
    const onScroll=()=>close();
    window.addEventListener("scroll",onScroll,true);
    return ()=>window.removeEventListener("scroll",onScroll,true);
  },[open]);

  const open_ = ()=>{
    if(trigRef.current){
      const r=trigRef.current.getBoundingClientRect();
      const spaceBelow=window.innerHeight-r.bottom;
      const dropH=Math.min(options.length*32+60,340);
      // position:fixed → viewport coords, no scroll offset
      const top=spaceBelow<dropH ? r.top-dropH-4 : r.bottom+2;
      const dropW=Math.max(r.width,280);
      const left=Math.min(r.left, window.innerWidth-dropW-8);
      setPos({top,left:Math.max(left,4),width:dropW});
    }
    setOpen(true); setQuery("");
  };
  const close = ()=>{ setOpen(false); setQuery(""); };
  const pick  = (v)=>{ onChange(v); close(); };
  const filtered = query ? options.filter(o=>o.label.toLowerCase().includes(query.toLowerCase())) : options;
  const selected = options.find(o=>o.value===value);

  return (
    <div ref={wrapRef} style={{position:"relative",...style}}>
      <div ref={trigRef}
        style={{...S.inputSm,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",minHeight:30}}
        onClick={open_}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,color:selected?"#e8eaed":"#666"}}>
          {selected?selected.label:(placeholder||"— wählen —")}
        </span>
        <span style={{fontSize:10,marginLeft:4}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{...S.dropdown,top:pos.top,left:pos.left,width:pos.width}}>
          <input autoFocus
            style={{...S.inputSm,width:"100%",boxSizing:"border-box",marginBottom:4}}
            placeholder="Tippen zum Filtern…"
            value={query} onChange={e=>setQuery(e.target.value)}
            onClick={e=>e.stopPropagation()}
            onKeyDown={e=>{ if(e.key==="Escape") close(); }}
          />
          <div style={S.dropdownList}>
            <div style={S.dropdownItem} onClick={()=>pick("")}><span style={{color:"#666"}}>— keine Auswahl —</span></div>
            {filtered.map(o=>(
              <div key={o.value}
                style={{...S.dropdownItem,...(o.value===value?S.dropdownItemActive:{})}}
                onClick={()=>pick(o.value)}>
                {o.label}
              </div>
            ))}
            {filtered.length===0&&<div style={{...S.dropdownItem,color:"#666"}}>Keine Treffer</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [tab,  setTab]  = useState("config");
  const [meta, setMeta] = useState(DEFAULT_META);
  const [showUpdateModal,   setShowUpdateModal]   = useState(false);
  const [updateStatus,      setUpdateStatus]      = useState({ type: 'idle' });
  const [showDonateModal,   setShowDonateModal]   = useState(false);
  const [changelogVersion,  setChangelogVersion]  = useState(null);

  // Hauptanschlüsse: [{id, name, amp}]
  const [mainConns, setMainConns] = useState([]);

  const [boxTypes,   setBoxTypes]   = useState(alphaSort(clone(DEFAULT_BOX_TYPES),"name"));
  const [loads,      setLoads]      = useState(alphaSort(clone(DEFAULT_LOADS),"name"));
  // instances: {id, typeId, name, parentId, parentOutletId, mainConnectionId}
  const [instances,  setInstances]  = useState([]);
  // placements: {id, instanceId, outletId, mcSlot(num|null), loadId}
  const [placements, setPlacements] = useState([]);
  const [activePlan,   setActivePlan]   = useState(null);
  const [inspMeta,     setInspMeta]     = useState({ inspector:"", date:new Date().toISOString().slice(0,10), time:"", equipment:"", address:"", location:"", netType:"" });
  const [inspResults,  setInspResults]  = useState({});
  const [cableCalcs,   setCableCalcs]   = useState([]);
  const [voltCalcs,    setVoltCalcs]    = useState([]);
  const [erweiterSubTab, setErweiterSubTab] = useState("dim");
  const [loaded,       setLoaded]       = useState(false); // prevent save before first load

  /* ── Autosave ──────────────────────────────────────────────────────────── */
  // Load on mount
  useEffect(()=>{
    try {
      const raw = localStorage.getItem(LS_KEY);
      if(raw){
        const d = JSON.parse(raw);
        if(d._format==="stromplaner"){
          if(d.meta)       setMeta(d.meta);
          if(d.mainConns)  setMainConns(d.mainConns);
          if(d.boxTypes)   setBoxTypes(alphaSort(d.boxTypes.map(migrateBoxType),"name"));
          if(d.loads)      setLoads(alphaSort(d.loads.map(l=>({...l,threePhase:l.threePhase||false})),"name"));
          if(d.instances)   setInstances(d.instances.map(migrateInstance));
          if(d.placements)  setPlacements(d.placements);
          if(d.inspMeta)    setInspMeta(d.inspMeta);
          if(d.inspResults) setInspResults(d.inspResults);
          if(d.cableCalcs)  setCableCalcs(d.cableCalcs);
          if(d.voltCalcs)   setVoltCalcs(d.voltCalcs);
        }
      }
    } catch(e){ console.warn("Autosave load error",e); }
    setLoaded(true);
  },[]);

  useEffect(()=>{
    window.electronAPI?.onUpdateStatus(msg => {
      setUpdateStatus(msg);
    });
  },[]);

  useEffect(()=>{
    if(!localStorage.getItem("stromplaner_donated")) setShowDonateModal(true);
  },[]);

  useEffect(()=>{
    if(!window.electronAPI?.appVersion) return;
    window.electronAPI.appVersion().then(v=>{
      const seen = localStorage.getItem("stromplaner_seen_version");
      if(seen !== v && CHANGELOG[v]) {
        setChangelogVersion(v);
        localStorage.setItem("stromplaner_seen_version", v);
      }
    });
  },[]);

  // Save on every change (debounced 600ms)
  const saveTimer = useRef(null);
  const schematicSvgRef = useRef(null);
  useEffect(()=>{
    if(!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>{
      try {
        const data={_format:"stromplaner",_version:4,meta,mainConns,boxTypes,loads,instances,placements,inspMeta,inspResults,cableCalcs,voltCalcs};
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch(e){ console.warn("Autosave error",e); }
    },600);
    return ()=>clearTimeout(saveTimer.current);
  },[meta,mainConns,boxTypes,loads,instances,placements,inspMeta,inspResults,cableCalcs,voltCalcs,loaded]);

  /* ── Derived ───────────────────────────────────────────────────────────── */
  const boxTypeById  = useMemo(()=>{ const m={}; boxTypes.forEach(b=>m[b.id]=b);   return m; },[boxTypes]);
  const loadById     = useMemo(()=>{ const m={}; loads.forEach(l=>m[l.id]=l);       return m; },[loads]);
  const instById     = useMemo(()=>{ const m={}; instances.forEach(i=>m[i.id]=i);   return m; },[instances]);
  const mainConnById = useMemo(()=>{ const m={}; mainConns.forEach(c=>m[c.id]=c);   return m; },[mainConns]);

  /* ── Load calculation ──────────────────────────────────────────────────── */
  const placementAmps = useCallback((p)=>{
    const load   = loadById[p.loadId];
    if(!load) return {L1:0,L2:0,L3:0};
    const inst   = instById[p.instanceId];
    const type   = inst ? boxTypeById[inst.typeId] : null;
    const outlet = type?.outlets.find(o=>o.id===p.outletId);
    if(!outlet) return {L1:0,L2:0,L3:0};
    const totalAmp = (load.watt||0)/VOLT;
    const r={L1:0,L2:0,L3:0};
    if(load.threePhase){
      r.L1=totalAmp; r.L2=totalAmp; r.L3=totalAmp;
    } else if(isMulticore(outlet.connector)){
      // Phase from mcSlot rotation
      const slot   = p.mcSlot||1;
      const ph     = PHASES[(slot-1)%3];
      r[ph]        = totalAmp;
    } else {
      const ph = outlet.phase||"L1";
      if(ph==="L1L2L3") r.L1=totalAmp;
      else r[ph]=totalAmp;
    }
    return r;
  },[loadById,instById,boxTypeById]);

  const ownLoad = useCallback((instanceId)=>{
    const r={L1:0,L2:0,L3:0};
    placements.filter(p=>p.instanceId===instanceId&&p.loadId).forEach(p=>{
      const a=placementAmps(p); r.L1+=a.L1; r.L2+=a.L2; r.L3+=a.L3;
    });
    return r;
  },[placements,placementAmps]);

  const totalLoad = useCallback((instanceId,visited=new Set())=>{
    if(visited.has(instanceId)) return {L1:0,L2:0,L3:0};
    visited.add(instanceId);
    const r=ownLoad(instanceId);
    instances.filter(c=>c.parentId===instanceId).forEach(child=>{
      const ch=totalLoad(child.id,visited); r.L1+=ch.L1; r.L2+=ch.L2; r.L3+=ch.L3;
    });
    return r;
  },[ownLoad,instances]);

  // Root instances = no parent kasten (may or may not have a mainConnectionId)
  const rootInstances = useMemo(()=>instances.filter(i=>!i.parentId),[instances]);

  const isOverloaded = useCallback((instanceId)=>{
    const t=totalLoad(instanceId);
    const inst=instById[instanceId];
    const type=inst?boxTypeById[inst.typeId]:null;
    const maxA=type?.feedAmp||0;
    if(!maxA) return false;
    return Math.max(t.L1,t.L2,t.L3)>maxA;
  },[totalLoad,instById,boxTypeById]);

  const isUnderdimensioned = useCallback((instanceId)=>{
    const inst=instById[instanceId];
    if(!inst||!inst.parentId||!inst.parentOutletId) return false;
    const type=boxTypeById[inst.typeId];
    if(!type) return false;
    const parentInst=instById[inst.parentId];
    const parentType=parentInst?boxTypeById[parentInst.typeId]:null;
    const outlet=parentType?.outlets.find(o=>o.id===inst.parentOutletId);
    if(!outlet) return false;
    return type.feedAmp > outlet.amp;
  },[instById,boxTypeById]);

  const isAdapted = useCallback((instanceId)=>{
    const inst=instById[instanceId];
    if(!inst||!inst.parentId||!inst.parentOutletId) return false;
    const type=boxTypeById[inst.typeId];
    if(!type||!type.feedConnector) return false;
    const parentInst=instById[inst.parentId];
    const parentType=parentInst?boxTypeById[parentInst.typeId]:null;
    const outlet=parentType?.outlets.find(o=>o.id===inst.parentOutletId);
    if(!outlet) return false;
    return outlet.connector!==type.feedConnector;
  },[instById,boxTypeById]);

  /* ── Instance actions ──────────────────────────────────────────────────── */
  const addInstance = (typeId)=>{
    const type=boxTypeById[typeId]; if(!type) return;
    const count=instances.filter(i=>i.typeId===typeId).length;
    setInstances(s=>[{
      id:uid(),typeId,
      name:count>0?`${type.name} #${count+1}`:type.name,
      parentId:null,parentOutletId:null,mainConnectionId:null,
    },...s]);
  };
  const removeInstance=(id)=>{
    setInstances(s=>s.filter(i=>i.id!==id).map(i=>i.parentId===id?{...i,parentId:null,parentOutletId:null}:i));
    setPlacements(s=>s.filter(p=>p.instanceId!==id));
    if(activePlan===id) setActivePlan(null);
  };
  const updateInstance=(id,patch)=>setInstances(s=>s.map(i=>i.id===id?{...i,...patch}:i));

  const setParentWithValidation=(instId,parentId,parentOutletId)=>{
    const inst=instById[instId]; if(!inst) return;
    const type=boxTypeById[inst.typeId];
    if(parentId&&parentOutletId){
      const parentInst=instById[parentId];
      const parentType=parentInst?boxTypeById[parentInst.typeId]:null;
      const outlet=parentType?.outlets.find(o=>o.id===parentOutletId);
      if(outlet&&type&&type.feedAmp>outlet.amp){
        const ok=confirm(`Warnung: ${type.name} (${type.feedAmp}A) wird auf einen ${outlet.amp}A Anschluss gesteckt.\nEffektive Absicherung: ${outlet.amp}A.\n\nFortfahren?`);
        if(!ok) return;
      }
    }
    updateInstance(instId,{parentId:parentId||null,parentOutletId:parentOutletId||null});
  };

  const addPlacement=(instanceId)=>setPlacements(s=>[...s,{id:uid(),instanceId,outletId:"",mcSlot:null,loadId:""}]);
  const addPlacementsFilled=(instanceId,loadId,outletId,count,startMcSlot=null)=>setPlacements(s=>[...s,...Array.from({length:count},(_,i)=>({id:uid(),instanceId,outletId:outletId||"",mcSlot:startMcSlot!==null?startMcSlot+i:null,loadId:loadId||""}))]);
  const updatePlacement=(id,patch)=>setPlacements(s=>s.map(p=>p.id===id?{...p,...patch}:p));
  const removePlacement=(id)=>setPlacements(s=>s.filter(p=>p.id!==id));

  /* ── Hauptanschluss actions ─────────────────────────────────────────────── */
  const addMainConn=()=>setMainConns(s=>[...s,{id:uid(),name:"Hauptanschluss "+(s.length+1),amp:""}]);
  const updateMainConn=(id,patch)=>setMainConns(s=>s.map(c=>c.id===id?{...c,...patch}:c));
  const removeMainConn=(id)=>{
    setMainConns(s=>s.filter(c=>c.id!==id));
    setInstances(s=>s.map(i=>i.mainConnectionId===id?{...i,mainConnectionId:null}:i));
  };

  /* ── Reset ─────────────────────────────────────────────────────────────── */
  const resetAll=()=>{
    if(!confirm("Alles zurücksetzen? Alle Kästen, Steckungen und Produktionsdaten werden gelöscht. Kasten-Typen und Verbraucher bleiben erhalten.")) return;
    setMeta(DEFAULT_META);
    setMainConns([]);
    setInstances([]);
    setPlacements([]);
    setActivePlan(null);
  };
  const clearAllInstances=()=>{
    if(!confirm("Alle Kästen und Steckungen löschen? Kasten-Typen, Verbraucher und Produktionsdaten bleiben erhalten.")) return;
    setInstances([]);
    setPlacements([]);
    setActivePlan(null);
  };

  /* ── JSON Save/Load ────────────────────────────────────────────────────── */
  const saveJSON=()=>{
    const data={_format:"stromplaner",_version:4,meta,mainConns,boxTypes,loads,instances:alphaSort(instances,"name"),placements,inspMeta,inspResults,cableCalcs,voltCalcs};
    downloadJSON(data,`Stromplan_${meta.production.replace(/\s+/g,"_")}.json`);
  };
  const loadJSON=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try {
        const d=JSON.parse(ev.target.result);
        if(d._format!=="stromplaner"){ alert("Keine gültige Stromplaner-Datei."); return; }
        if(d.meta)       setMeta(d.meta);
        if(d.mainConns)  setMainConns(d.mainConns||[]);
        if(d.boxTypes)   setBoxTypes(alphaSort(d.boxTypes.map(migrateBoxType),"name"));
        if(d.loads)      setLoads(alphaSort(d.loads.map(l=>({...l,threePhase:l.threePhase||false})),"name"));
        if(d.instances)   setInstances(d.instances.map(migrateInstance));
        if(d.placements)  setPlacements(d.placements);
        if(d.inspMeta)    setInspMeta(d.inspMeta);
        if(d.inspResults) setInspResults(d.inspResults);
        if(d.cableCalcs)  setCableCalcs(d.cableCalcs);
        if(d.voltCalcs)   setVoltCalcs(d.voltCalcs);
        setActivePlan(null);
        alert("Planung geladen ✓");
      } catch(err){ alert("Fehler: "+err.message); }
    };
    reader.readAsText(file);
    e.target.value="";
  };

  /* ── Excel export ──────────────────────────────────────────────────────── */
  const exportExcel=()=>{
    const wb=XLSX.utils.book_new();
    // Übersicht
    const ovRows=[
      ["STROMPLAN – ÜBERSICHT"],
      ["Produktion",meta.production],["Ersteller",meta.creator],["Version",meta.version],["Datum",meta.date],[],
      ["Kasten","Typ","Eingang","hängt an","Hauptanschluss","L1(A)","L2(A)","L3(A)","Max(A)","Status"],
    ];
    instances.forEach(inst=>{
      const t=totalLoad(inst.id); const type=boxTypeById[inst.typeId];
      const maxA=type?.feedAmp||0; const conn=type?(CONN[type.feedConnector]?.label||""):"";
      const peak=Math.max(t.L1,t.L2,t.L3); const pct=maxA?Math.round((peak/maxA)*100):0;
      const note=maxA&&peak>maxA?"ÜBERLAST!":pct>80?">80%":"";
      const mainC=inst.mainConnectionId?mainConnById[inst.mainConnectionId]?.name:"—";
      ovRows.push([inst.name,type?.name,conn,inst.parentId?instById[inst.parentId]?.name:"Einspeisung",mainC,round2(t.L1),round2(t.L2),round2(t.L3),maxA,note]);
    });
    const ovWs=XLSX.utils.aoa_to_sheet(ovRows);
    XLSX.utils.book_append_sheet(wb,ovWs,"Übersicht");
    // Hauptanschlüsse
    const haRows=[["HAUPTANSCHLÜSSE"],[],["Name","Max(A)","L1(A)","L2(A)","L3(A)","Auslastung"]];
    mainConns.forEach(mc=>{
      const connInsts=rootInstances.filter(i=>i.mainConnectionId===mc.id);
      const tot={L1:0,L2:0,L3:0};
      connInsts.forEach(i=>{ const t=totalLoad(i.id); tot.L1+=t.L1; tot.L2+=t.L2; tot.L3+=t.L3; });
      const peak=Math.max(tot.L1,tot.L2,tot.L3);
      const pct=mc.amp?Math.round((peak/mc.amp)*100):0;
      haRows.push([mc.name,mc.amp||"–",round2(tot.L1),round2(tot.L2),round2(tot.L3),mc.amp?`${pct}%`:"–"]);
    });
    const haWs=XLSX.utils.aoa_to_sheet(haRows);
    XLSX.utils.book_append_sheet(wb,haWs,"Hauptanschlüsse");
    // Pro Kasten
    instances.forEach(inst=>{
      const type=boxTypeById[inst.typeId];
      const own=ownLoad(inst.id); const tot=totalLoad(inst.id);
      const conn=type?(CONN[type.feedConnector]?.label||""):"";
      const rows=[[inst.name],["Typ",type?.name],["Eingang",conn,"Max",`${type?.feedAmp||""}A`],
        ["hängt an",inst.parentId?instById[inst.parentId]?.name:"Einspeisung"],[],
        ["Verbraucher","Anschluss","Steckplatz","Phase","W","A","Sich.","Schutz"]];
      placements.filter(p=>p.instanceId===inst.id).forEach(p=>{
        const l=loadById[p.loadId]; const out=type?.outlets.find(o=>o.id===p.outletId);
        const amp=l&&l.watt?round2(l.watt/VOLT):"";
        let ph=""; let slot="";
        if(l?.threePhase){ ph="L1+L2+L3"; }
        else if(out&&isMulticore(out.connector)){ const s=p.mcSlot||1; ph=PHASES[(s-1)%3]; slot=`Steckplatz ${s}`; }
        else { ph=out?.phase||""; }
        rows.push([l?.name||"",out?.label||"",slot,ph,l?.watt||"",amp,out?.breaker||"",out?.protection||""]);
      });
      rows.push([],["EIGENLAST","","","L1",round2(own.L1),"L2",round2(own.L2),"L3",round2(own.L3)]);
      rows.push(["GESAMTLAST","","","L1",round2(tot.L1),"L2",round2(tot.L2),"L3",round2(tot.L3)]);
      const ws=XLSX.utils.aoa_to_sheet(rows);
      const safeName=(inst.name||inst.id).slice(0,28).replace(/[\\/?*[\]:]/g,"");
      XLSX.utils.book_append_sheet(wb,ws,safeName||inst.id);
    });
    // Verbraucher
    const lRows=[["VERBRAUCHER"],[],["Name","W","A","3-phasig"]];
    loads.forEach(l=>lRows.push([l.name,l.watt||"",l.watt?round2(l.watt/VOLT):"",l.threePhase?"Ja":"Nein"]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(lRows),"Verbraucher");
    XLSX.writeFile(wb,`Stromplan_${meta.production.replace(/\s+/g,"_")}.xlsx`);
  };

  /* ── PDF export ─────────────────────────────────────────────────────────── */
  const exportPDF=()=>{
    const pw=window.open("","_blank","width=900,height=700");
    if(!pw){ alert("Popup-Blocker aktiv – bitte erlauben."); return; }
    const phBar=(vals,maxA)=>PHASES.map(ph=>{
      const a=round2(vals[ph]); const pct=maxA?Math.round((a/maxA)*100):0;
      const col=pct>100?"#c0392b":pct>80?"#e67e22":"#27ae60";
      return `<div style="flex:1;text-align:center;padding:4px 8px;background:#f8f8f8;border:1px solid #ddd;border-radius:4px">
        <div style="font-weight:700;font-size:11px">${ph}</div>
        <div style="font-size:16px;font-weight:800;color:${col}">${a} A</div>
        <div style="height:5px;background:#eee;border-radius:3px;margin:3px 0"><div style="height:100%;width:${Math.min(pct,100)}%;background:${col};border-radius:3px"></div></div>
        <div style="font-size:9px;color:#666">${maxA?pct+"% von "+maxA+"A":""}</div></div>`;
    }).join("");
    let body=`<h1 style="font-size:18px;margin:0 0 4px">⚡ STROMPLAN</h1>
      <div style="font-size:12px;color:#555;margin-bottom:16px">${meta.production} · ${meta.creator} · v${meta.version} · ${meta.date}</div>`;
    if(mainConns.length){
      body+=`<h2 style="font-size:13px;background:#1c2127;color:#fff;padding:6px 10px;margin:0 0 8px;border-radius:4px">Hauptanschlüsse</h2>`;
      mainConns.forEach(mc=>{
        const connInsts=rootInstances.filter(i=>i.mainConnectionId===mc.id);
        const tot={L1:0,L2:0,L3:0};
        connInsts.forEach(i=>{ const t=totalLoad(i.id); tot.L1+=t.L1; tot.L2+=t.L2; tot.L3+=t.L3; });
        body+=`<div style="margin-bottom:10px"><b>${mc.name}</b>${mc.amp?` (max ${mc.amp}A)`:""}<div style="display:flex;gap:6px;margin-top:4px">${phBar(tot,mc.amp||0)}</div></div>`;
      });
    }
    instances.forEach(inst=>{
      const type=boxTypeById[inst.typeId]; const own=ownLoad(inst.id); const tot=totalLoad(inst.id);
      const maxA=type?.feedAmp||0; const conn=type?(CONN[type.feedConnector]?.label||""):"";
      const rows2=placements.filter(p=>p.instanceId===inst.id).map(p=>{
        const l=loadById[p.loadId]; const out=type?.outlets.find(o=>o.id===p.outletId);
        if(!l) return null;
        const amp=l.watt?round2(l.watt/VOLT):0;
        let ph="",slot="";
        if(l.threePhase){ ph="L1+L2+L3"; }
        else if(out&&isMulticore(out.connector)){ const s=p.mcSlot||1; ph=PHASES[(s-1)%3]; slot=`Steckplatz ${s}`; }
        else { ph=out?.phase||""; }
        return {name:l.name,outlet:out?.label||"",slot,ph,watt:l.watt,amp,breaker:out?.breaker||"",prot:out?.protection||""};
      }).filter(Boolean);
      body+=`<div style="page-break-inside:avoid;margin-top:18px">
        <h2 style="font-size:13px;background:#2e75b6;color:#fff;padding:6px 10px;margin:0 0 6px;border-radius:4px">${inst.name} <span style="font-weight:400;font-size:11px">(${type?.name||""} · ${conn} · max ${maxA}A)</span></h2>
        <div style="font-size:11px;color:#555;margin-bottom:6px">hängt an: ${inst.parentId?instById[inst.parentId]?.name:inst.mainConnectionId?(mainConnById[inst.mainConnectionId]?.name||"— Einspeisung —"):"— Einspeisung —"}</div>
        <div style="display:flex;gap:6px;margin-bottom:8px">${phBar(tot,maxA)}</div>`;
      if(rows2.length){
        body+=`<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#eee">
          ${["Verbraucher","Anschluss","Steckplatz","Phase","W","A","Sich.","Schutz"].map(h=>`<th style="padding:3px 5px;border:1px solid #ddd">${h}</th>`).join("")}</tr></thead><tbody>`;
        rows2.forEach(r=>{ body+=`<tr>${[r.name,r.outlet,r.slot,r.ph,r.watt,r.amp,r.breaker,r.prot].map(v=>`<td style="padding:2px 5px;border:1px solid #ddd">${v}</td>`).join("")}</tr>`; });
        body+=`</tbody></table>`;
      } else body+=`<p style="font-size:11px;color:#999;font-style:italic">Keine Verbraucher gesteckt.</p>`;
      body+=`</div>`;
    });

    /* ── Leitungsdimensionierung ──────────────────────────────────── */
    if(cableCalcs.length>0){
      body+=`<div style="page-break-inside:avoid;margin-top:28px">
        <h2 style="font-size:13px;background:#2d3748;color:#fff;padding:6px 10px;margin:0 0 8px;border-radius:4px">Leitungsdimensionierung (H07RN-F)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr style="background:#eee">
            <th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Bezeichnung</th>
            <th style="padding:3px 6px;border:1px solid #ddd">I&#x2B;(A)</th>
            <th style="padding:3px 6px;border:1px solid #ddd">I&#x2099;(A)</th>
            <th style="padding:3px 6px;border:1px solid #ddd">Querschnitt</th>
            <th style="padding:3px 6px;border:1px solid #ddd">Faktor</th>
            <th style="padding:3px 6px;border:1px solid #ddd">I&#x1D467;(A)</th>
            <th style="padding:3px 6px;border:1px solid #ddd">I&#x2B;&le;I&#x2099;</th>
            <th style="padding:3px 6px;border:1px solid #ddd">I&#x2099;&le;I&#x1D467;</th>
          </tr></thead><tbody>`;
      cableCalcs.forEach(c=>{
        const dim=calcDim(c.cableA,c.fTemp,c.fAdern,c.fLagen,c.fArt,c.fN);
        const ready=c.I_B!==''&&c.I_n!==''&&c.cableA!=='';
        const chk1=ready&&+c.I_B<=+c.I_n; const chk2=ready&&dim!=null&&+c.I_n<=dim.izul;
        const ok1=ready?(chk1?'&#10003;':'&#10007;'):'–'; const ok2=ready&&dim?(chk2?'&#10003;':'&#10007;'):'–';
        const col1=!ready?'#666':chk1?'#1a7a3a':'#c0392b'; const col2=!ready||!dim?'#666':chk2?'#1a7a3a':'#c0392b';
        body+=`<tr>
          <td style="padding:2px 6px;border:1px solid #ddd">${c.label||'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${c.I_B||'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${c.I_n||'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${c.cableA?c.cableA+' mm²':'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${dim?dim.fTotal:'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${dim?dim.izul:'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center;color:${col1};font-weight:700">${ok1}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center;color:${col2};font-weight:700">${ok2}</td>
        </tr>`;
      });
      body+=`</tbody></table></div>`;
    }

    /* ── Spannungsfall ────────────────────────────────────────────── */
    if(voltCalcs.length>0){
      body+=`<div style="page-break-inside:avoid;margin-top:18px">
        <h2 style="font-size:13px;background:#2d3748;color:#fff;padding:6px 10px;margin:0 0 8px;border-radius:4px">Spannungsfall (DIN VDE 0100-520)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr style="background:#eee">
            <th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Bezeichnung</th>
            <th style="padding:3px 6px;border:1px solid #ddd">I(A)</th>
            <th style="padding:3px 6px;border:1px solid #ddd">l(m)</th>
            <th style="padding:3px 6px;border:1px solid #ddd">cos&phi;</th>
            <th style="padding:3px 6px;border:1px solid #ddd">A(mm²)</th>
            <th style="padding:3px 6px;border:1px solid #ddd">Phasigkeit</th>
            <th style="padding:3px 6px;border:1px solid #ddd">&Delta;U(V)</th>
            <th style="padding:3px 6px;border:1px solid #ddd">&Delta;U(%)</th>
            <th style="padding:3px 6px;border:1px solid #ddd">A&le;3%</th>
          </tr></thead><tbody>`;
      voltCalcs.forEach(c=>{
        const is3=c.threePhase==='3ph';
        const ready=c.I!==''&&c.l!==''&&c.cosPhi!==''&&c.cableA!==''&&c.threePhase!=='';
        const du=ready?calcVoltDrop(+c.I,+c.l,+c.cableA,+c.cosPhi,is3):null;
        const minA=ready?minCsVoltDrop(+c.I,+c.l,+c.cosPhi,is3,3):null;
        const pct=du?du.pct:null;
        const col=pct===null?'#666':pct<=3?'#1a7a3a':pct<=5?'#b05a00':'#c0392b';
        body+=`<tr>
          <td style="padding:2px 6px;border:1px solid #ddd">${c.label||'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${c.I||'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${c.l||'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${c.cosPhi||'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${c.cableA||'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${c.threePhase==='3ph'?'3-phasig':'1-phasig'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center;color:${col}">${du?du.V+' V':'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center;color:${col};font-weight:700">${du?du.pct+' %':'–'}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;text-align:center">${minA!==null?minA+' mm²':'–'}</td>
        </tr>`;
      });
      body+=`</tbody></table></div>`;
    }

    /* ── Blockschaltbild ──────────────────────────────────────────── */
    const svgEl=schematicSvgRef.current;
    if(svgEl&&instances.length>0){
      const svgClone=svgEl.cloneNode(true);

      // Skalierung: viewBox setzen, Breite 100%, Höhe proportional (kein Clip im PDF)
      const svgW_orig=+svgEl.getAttribute('width')||800;
      const svgH_orig=+svgEl.getAttribute('height')||600;
      svgClone.setAttribute('viewBox',`0 0 ${svgW_orig} ${svgH_orig}`);
      svgClone.setAttribute('width','100%');
      svgClone.removeAttribute('height');
      svgClone.style.cssText='display:block;background:#fff;max-width:100%;height:auto';

      // Vollständige Farbumwandlung Dark → Light
      // fill-Map
      const fillMap={
        '#1b2026':'#e8edf2','#21282f':'#f0f4f8','#1f252c':'#e4e9ee','#1f242b':'#e4e9ee',
        '#252b33':'#f4f4f4','#252e3a':'#dde3ea','#2a3a2a':'#e8f0e8','#1a2530':'#e6edf4',
        '#1c2127':'#e4eaf0','#1e2a32':'#e4edf4','#2d3748':'#2d3748',
        'none':'none',
      };
      // stroke-Map
      const strokeMap={
        '#3a424c':'#bbb','#4a5568':'#999','#3a5468':'#999','#3a5060':'#8aacbe',
        '#2a3a2a':'#8aac8a','#f5a623':'#b05a00','#4a5060':'#8aacbe',
        '#2ecc71':'#1a8040','#e74c3c':'#c0392b',
      };
      // text fill-Map
      const textMap={
        '#e8eaed':'#1a1a1a','#9aa4af':'#555','#6b7a8d':'#555','#4a5568':'#555',
        '#8aaccc':'#2a6a9a','#7aaabf':'#2a6a9a','#6aaabf':'#1a6a8f','#3a6070':'#3a6a7a',
        '#3a6a4a':'#1a5a3a','#3a4a5a':'#4a5a6a','#f5a623':'#b05a00','#d97706':'#8a4a00',
        '#666':'#555','#3a7a5a':'#1a5a3a','#4a6a7a':'#2a5a6a','#5a6a7a':'#4a5a6a',
        '#a78bfa':'#6a4fca','#c4a8fa':'#8a6aca','#2ecc71':'#1a8040','#e74c3c':'#c0392b',
      };

      svgClone.querySelectorAll('rect,circle,path,polygon').forEach(el=>{
        const f=el.getAttribute('fill');
        if(f && fillMap[f]) el.setAttribute('fill',fillMap[f]);
        const s=el.getAttribute('stroke');
        if(s && strokeMap[s]) el.setAttribute('stroke',strokeMap[s]);
      });
      svgClone.querySelectorAll('line').forEach(el=>{
        const s=el.getAttribute('stroke');
        if(s && strokeMap[s]) el.setAttribute('stroke',strokeMap[s]);
        else if(s && fillMap[s]) el.setAttribute('stroke',fillMap[s]);
      });
      svgClone.querySelectorAll('text').forEach(t=>{
        const f=t.getAttribute('fill');
        if(f && textMap[f]) t.setAttribute('fill',textMap[f]);
        // Text-Halo-Stroke (paintOrder:stroke auf dunklem Hintergrund) → weiss werden lassen
        const st=t.getAttribute('style')||'';
        if(st.includes('stroke:#1b2026')||st.includes('stroke:#21282f')||st.includes('stroke:#1a2530')){
          t.setAttribute('style',st.replace(/stroke:#[0-9a-f]+/gi,'stroke:#fff'));
        }
      });
      // path-Strokes (Verbindungslinien)
      svgClone.querySelectorAll('path').forEach(el=>{
        const s=el.getAttribute('stroke');
        if(s && strokeMap[s]) el.setAttribute('stroke',strokeMap[s]);
        else if(s==='#3a6070'||s==='#3a5060') el.setAttribute('stroke','#7aaabe');
        else if(s==='#4a5568') el.setAttribute('stroke','#888');
      });

      body+=`<div style="page-break-before:always">
        <h2 style="font-size:13px;background:#2d3748;color:#fff;padding:6px 10px;margin:0 0 12px;border-radius:4px">Blockschaltbild</h2>
        ${svgClone.outerHTML}</div>`;
    }

    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stromplan – ${meta.production}</title>
      <style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#222;margin:0}</style>
      </head><body>${body}</body></html>`);
    pw.document.close();
    setTimeout(()=>{ pw.focus(); pw.print(); },600);
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */
  const TABS=[
    ["config","1 · Konfiguration"],["plan","2 · Steckplan"],
    ["overview","3 · Übersicht"],["schematic","Schaltbild"],["inspection","Errichtungsprüfung"],
    ["boxtypes","Kasten-Typen"],["loads","Verbraucher"],["erweitert","Erweitert"],
  ];
  const sharedProps={ instances,instById,boxTypeById,totalLoad,isOverloaded,isUnderdimensioned,isAdapted,rootInstances,mainConns,mainConnById };

  return (
    <div style={S.app}>
      <header style={S.header}>
        <div style={S.logo}>⚡ STROMPLANER</div>
        <div style={S.headerMeta}>{meta.production} · v{meta.version} · {meta.date}</div>
        <span style={{fontSize:10,color:"#555",marginLeft:4}} title="Automatisch gespeichert">💾 auto</span>
        <label style={S.ghostBtn}>↥ Laden<input type="file" accept=".json" onChange={loadJSON} style={{display:"none"}}/></label>
        <button style={S.ghostBtn} onClick={saveJSON}>💾 Speichern</button>
        <button style={S.ghostBtn} onClick={resetAll}>↺ Neu</button>
        {window.electronAPI&&<button style={S.ghostBtn} onClick={()=>setShowUpdateModal(true)}>
          {updateStatus.type==='downloaded'?'↓ Update bereit':updateStatus.type==='available'?'↑ Update verfügbar':'↑ Updates'}
        </button>}
        <button style={{...S.ghostBtn,color:'#f5a623'}} onClick={()=>setShowDonateModal(true)}>☕</button>
        <button style={S.exportBtn} onClick={exportPDF}>🖨 PDF</button>
      </header>
      <nav style={S.nav}>
        {TABS.map(([k,label])=>(
          <button key={k}
            style={{...S.navBtn,...(tab===k?S.navBtnActive:{}),...(k==="erweitert"?{color:tab===k?"#f5a623":"#c08030",borderColor:tab===k?"#f5a623":"transparent"}:{})}}
            onClick={()=>setTab(k)}>{label}</button>
        ))}
        {tab==="erweitert" && <>
          <span style={{color:"#3a424c",alignSelf:"center",margin:"0 2px",fontSize:16}}>&rsaquo;</span>
          {[["dim","Leitungsdimensionierung"],["volt","Spannungsfall"]].map(([k,lbl])=>(
            <button key={k} style={{
              ...S.navBtn,
              ...(erweiterSubTab===k ? S.navBtnActive : {}),
              ...(erweiterSubTab===k ? {color:"#f5a623",borderColor:"#f5a623"} : {color:"#c08030"})
            }} onClick={()=>setErweiterSubTab(k)}>{lbl}</button>
          ))}
        </>}
      </nav>
      <main style={S.main}>
        {/* Alle Tabs bleiben gemountet – nur CSS display:none beim Verstecken */}
        <div style={{display:tab==="config"?"block":"none"}}>
          <ConfigTab {...sharedProps} meta={meta} setMeta={setMeta} boxTypes={boxTypes}
            addInstance={addInstance} removeInstance={removeInstance} updateInstance={updateInstance}
            setParentWithValidation={setParentWithValidation} clearAllInstances={clearAllInstances}
            mainConns={mainConns} addMainConn={addMainConn} updateMainConn={updateMainConn} removeMainConn={removeMainConn} />
        </div>
        <div style={{display:tab==="plan"?"block":"none"}}>
          <PlanTab {...sharedProps} loads={loads} loadById={loadById}
            placements={placements} addPlacement={addPlacement} addPlacementsFilled={addPlacementsFilled} updatePlacement={updatePlacement} removePlacement={removePlacement}
            activePlan={activePlan} setActivePlan={setActivePlan} ownLoad={ownLoad} meta={meta} />
        </div>
        <div style={{display:tab==="overview"?"block":"none"}}>
          <OverviewTab {...sharedProps} meta={meta} placements={placements} loads={loads} loadById={loadById} />
        </div>
        <div style={{display:tab==="schematic"?"block":"none"}}>
          <SchematicTab {...sharedProps} meta={meta} svgRef={schematicSvgRef} placements={placements} loadById={loadById}/>
        </div>
        <div style={{display:tab==="boxtypes"?"block":"none"}}>
          <BoxTypesTab boxTypes={boxTypes} setBoxTypes={setBoxTypes} instances={instances} />
        </div>
        <div style={{display:tab==="loads"?"block":"none"}}>
          <LoadsTab loads={loads} setLoads={setLoads} />
        </div>
        <div style={{display:tab==="inspection"?"block":"none"}}>
          <InspectionTab {...sharedProps} meta={meta} placements={placements} loadById={loadById} inspMeta={inspMeta} setInspMeta={setInspMeta} inspResults={inspResults} setInspResults={setInspResults} />
        </div>
        <div style={{display:tab==="erweitert"?"block":"none"}}>
          <ErweitertTab cableCalcs={cableCalcs} setCableCalcs={setCableCalcs}
            voltCalcs={voltCalcs} setVoltCalcs={setVoltCalcs}
            subTab={erweiterSubTab}/>
        </div>
      </main>
      {changelogVersion&&<ChangelogModal version={changelogVersion} onClose={()=>setChangelogVersion(null)}/>}
      {showDonateModal&&<DonateModal onClose={()=>{ localStorage.setItem("stromplaner_donated","1"); setShowDonateModal(false); }}/>}
      {showUpdateModal&&<UpdateModal status={updateStatus} onClose={()=>setShowUpdateModal(false)} onCheck={()=>window.electronAPI.checkForUpdates()} onInstall={()=>window.electronAPI.installUpdate()} setStatus={setUpdateStatus}/>}
    </div>
  );
}

function UpdateModal({status,onClose,onCheck,onInstall,setStatus}){
  const busy=status.type==='checking'||status.type==='downloading';
  const overlay={position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'};
  const box={background:'#1e2530',border:'1px solid #2e3a4a',borderRadius:10,padding:'28px 32px',minWidth:340,maxWidth:420,color:'#e8eaf0',fontFamily:'inherit'};
  const title={fontSize:16,fontWeight:700,marginBottom:16,color:'#fff'};
  const row={display:'flex',gap:10,marginTop:18,justifyContent:'flex-end'};
  const btn=(c)=>({padding:'7px 18px',borderRadius:5,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,...c});

  return(
    <div style={overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={box}>
        <div style={title}>Software-Update</div>
        {status.type==='idle'&&<p style={{color:'#aab',margin:0}}>Auf neue Version prüfen?</p>}
        {status.type==='checking'&&<p style={{color:'#aab',margin:0}}>Suche nach Updates…</p>}
        {status.type==='up-to-date'&&<p style={{color:'#6dbf7e',margin:0}}>✓ Du hast bereits die neueste Version.</p>}
        {status.type==='available'&&<p style={{color:'#f5a623',margin:0}}>Version {status.version} verfügbar – wird heruntergeladen…</p>}
        {status.type==='downloading'&&<p style={{color:'#5bb8f5',margin:0}}>Wird heruntergeladen… {status.percent!=null?status.percent+'%':''}</p>}
        {status.type==='downloaded'&&<p style={{color:'#6dbf7e',margin:0}}>✓ Version {status.version||''} bereit. Nach dem Neustart wird die neue Version installiert.</p>}
        {status.type==='error'&&<p style={{color:'#e06c75',margin:0}}>Fehler: {status.message||'Update konnte nicht geprüft werden.'}</p>}
        <div style={row}>
          {status.type==='downloaded'
            ?<button style={btn({background:'#3a7bd5',color:'#fff'})} onClick={onInstall}>Jetzt neu starten</button>
            :<button style={btn({background:'#3a7bd5',color:'#fff',opacity:busy?0.6:1})} disabled={busy} onClick={()=>{setStatus({type:'checking'});onCheck();}}>Nach Updates suchen</button>
          }
          <button style={btn({background:'#2a3547',color:'#aab'})} onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

function ChangelogModal({ version, onClose }) {
  const entries = CHANGELOG[version] || [];
  const overlay = { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' };
  const box     = { background:'#1e2530',border:'1px solid #2e3a4a',borderRadius:12,padding:'28px 32px',maxWidth:420,width:'90%',color:'#e8eaf0',fontFamily:'inherit' };
  return (
    <div style={overlay} onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={box}>
        <div style={{fontSize:15,fontWeight:700,color:'#fff',marginBottom:4}}>Was ist neu in v{version}</div>
        <div style={{fontSize:11,color:'#5a6a7a',marginBottom:16}}>Stromplaner wurde aktualisiert</div>
        <ul style={{margin:0,padding:'0 0 0 18px',display:'flex',flexDirection:'column',gap:7}}>
          {entries.map((e,i)=>(
            <li key={i} style={{fontSize:13,color:'#c8d0da',lineHeight:1.5}}>{e}</li>
          ))}
        </ul>
        <div style={{marginTop:22,display:'flex',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'7px 20px',borderRadius:6,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:'#3a7bd5',color:'#fff'}}>
            Los geht's
          </button>
        </div>
      </div>
    </div>
  );
}

function DonateModal({ onClose }) {
  const overlay = { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' };
  const box     = { background:'#1e2530',border:'1px solid #2e3a4a',borderRadius:12,padding:'32px 36px',maxWidth:380,color:'#e8eaf0',fontFamily:'inherit',textAlign:'center' };
  const btn     = (c) => ({ padding:'8px 20px',borderRadius:6,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,...c });
  return (
    <div style={overlay}>
      <div style={box}>
        <div style={{fontSize:42,marginBottom:12}}>☕</div>
        <div style={{fontSize:17,fontWeight:700,marginBottom:10,color:'#fff'}}>Stromplaner gefällt dir?</div>
        <p style={{fontSize:13,color:'#9aa4af',lineHeight:1.6,marginBottom:24}}>
          Das Tool ist kostenlos und wird in meiner Freizeit weiterentwickelt.<br/>
          Wenn es dir bei deiner Arbeit hilft, freue ich mich über einen Kaffee. ☕
        </p>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button style={btn({background:'#f5a623',color:'#1b2026'})}
            onClick={()=>{ window.open('https://github.com/sponsors/MrPancaketwtch','_blank'); onClose(); }}>
            Einen Kaffee spendieren
          </button>
          <button style={btn({background:'#2a3547',color:'#9aa4af'})} onClick={onClose}>
            Vielleicht später
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Konfiguration
══════════════════════════════════════════════════════════════════════════ */
function ConfigTab({ meta,setMeta,boxTypes,instances,instById,boxTypeById,addInstance,removeInstance,updateInstance,setParentWithValidation,clearAllInstances,isOverloaded,isUnderdimensioned,isAdapted,mainConns,addMainConn,updateMainConn,removeMainConn }) {
  const [pick,setPick]=useState(boxTypes[0]?.id||"");
  return (
    <div>
      <Section title="Produktionsdaten">
        <div style={S.metaGrid}>
          <Field label="Produktion"><input style={S.input} value={meta.production} onChange={e=>setMeta({...meta,production:e.target.value})}/></Field>
          <Field label="Ersteller"><input style={S.input} value={meta.creator} onChange={e=>setMeta({...meta,creator:e.target.value})}/></Field>
          <Field label="Version"><input style={S.input} value={meta.version} onChange={e=>setMeta({...meta,version:e.target.value})}/></Field>
          <Field label="Datum"><input type="date" style={S.input} value={meta.date} onChange={e=>setMeta({...meta,date:e.target.value})}/></Field>
        </div>
      </Section>

      <Section title="Hauptanschlüsse" subtitle="Definiere alle Einspeisepunkte dieser Produktion. Kästen können optional einem Hauptanschluss zugewiesen werden.">
        <button style={S.primaryBtn} onClick={addMainConn}>+ Hauptanschluss hinzufügen</button>
        {mainConns.length===0 && <p style={S.hint}>Noch keine Hauptanschlüsse definiert. Kästen ohne Zuweisung erscheinen als freie Einspeisepunkte.</p>}
        {mainConns.map(mc=>(
          <div key={mc.id} style={{display:"flex",gap:8,alignItems:"center",marginTop:8,flexWrap:"wrap"}}>
            <input style={{...S.inputSm,flex:2,minWidth:150}} placeholder="Bezeichnung z.B. NH03-Halle 1" value={mc.name} onChange={e=>updateMainConn(mc.id,{name:e.target.value})}/>
            <input type="number" style={{...S.inputSm,width:90}} placeholder="Max A" value={mc.amp} onChange={e=>updateMainConn(mc.id,{amp:e.target.value})}/>
            <span style={{fontSize:12,color:"#9aa4af"}}>A</span>
            <button style={S.dangerBtn} onClick={()=>removeMainConn(mc.id)}>✕</button>
          </div>
        ))}
      </Section>

      <Section title="Kästen aktivieren" subtitle="Jeder aktivierte Kasten bekommt im Steckplan ein eigenes Datenblatt.">
        <div style={S.row}>
          <select style={S.select} value={pick} onChange={e=>setPick(e.target.value)}>
            {boxTypes.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button style={S.primaryBtn} onClick={()=>addInstance(pick)}>+ Kasten hinzufügen</button>
        </div>
        {instances.length===0 ? <p style={S.empty}>Noch keine Kästen aktiviert.</p> : (
          <div style={{overflowX:"auto"}}>
          <table style={{...S.table,minWidth:860,width:"auto"}}>
            <thead><tr>
              <th style={S.th}></th><th style={S.th}>Name</th><th style={S.th}>Typ</th><th style={S.th}>Eingang</th>
              <th style={S.th}>hängt an Kasten…</th><th style={S.th}>…Anschluss</th>
              <th style={S.th}>Hauptanschluss</th><th style={S.th}></th>
            </tr></thead>
            <tbody>
              {instances.map(inst=>{
                const type=boxTypeById[inst.typeId];
                const parentType=inst.parentId?boxTypeById[instById[inst.parentId]?.typeId]:null;
                const ol=isOverloaded(inst.id);
                const ud=isUnderdimensioned(inst.id);
                const sortedOther=alphaSort(instances.filter(o=>o.id!==inst.id),"name");
                const parentOutlets=parentType?sortOutlets(parentType.outlets):[];
                // Belegte Anschlüsse ausblenden (anderer Kasten hängt schon dort)
                // Nur kompatible Steckertypen anzeigen (Eingangstyp des Kastens muss passen)
                const takenOutletIds=new Set(instances.filter(i=>i.id!==inst.id&&i.parentId===inst.parentId&&i.parentId).map(i=>i.parentOutletId).filter(Boolean));
                const availableOutlets=parentOutlets.filter(o=>{
                  if(takenOutletIds.has(o.id)&&o.id!==inst.parentOutletId) return false;
                  // Familien-fremde Verbindungen blocken (z.B. CEE3P nicht auf Schuko)
                  if(type?.feedConnector&&CONN_FAMILY[type.feedConnector]!==CONN_FAMILY[o.connector]) return false;
                  return true;
                }).sort((a,b)=>{
                  // Gleicher Steckertyp zuerst, Adapter-Kompatible danach
                  const aExact=type?.feedConnector&&a.connector===type.feedConnector?0:1;
                  const bExact=type?.feedConnector&&b.connector===type.feedConnector?0:1;
                  if(aExact!==bExact) return aExact-bExact;
                  return a.label.localeCompare(b.label,"de",{numeric:true});
                });
                // Only show Hauptanschluss picker for root instances
                const isRoot=!inst.parentId;
                return (
                  <tr key={inst.id}>
                    <td style={S.td}>
                      {ol&&<span title="Überlastet!" style={{color:"#e74c3c",fontWeight:800,fontSize:16}}>⚠</span>}
                      {ud&&<span title={`Unterdimensioniert: Kasten-Eingang (${boxTypeById[inst.typeId]?.feedAmp}A) größer als Anschluss`} style={{color:"#f5a623",fontWeight:800,fontSize:15,marginLeft:ol?4:0}}>⚡</span>}
                      {isAdapted(inst.id)&&<span title="Adapter: Steckertyp des Kastens stimmt nicht mit Anschluss überein" style={{color:"#a78bfa",fontWeight:800,fontSize:14,marginLeft:(ol||ud)?4:0}}>🔌</span>}
                    </td>
                    <td style={S.td}><input style={S.inputSm} value={inst.name} onChange={e=>updateInstance(inst.id,{name:e.target.value})}/></td>
                    <td style={S.td}>{type?.name}</td>
                    <td style={{...S.td,fontSize:11}}>{type?CONN[type.feedConnector]?.label:""}</td>
                    <td style={S.td}>
                      <select style={S.selectSm} value={inst.parentId||""} onChange={e=>setParentWithValidation(inst.id,e.target.value,null)}>
                        <option value="">— Einspeisung —</option>
                        {sortedOther.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </td>
                    <td style={S.td}>
                      <select style={S.selectSm} value={inst.parentOutletId||""} disabled={!inst.parentId}
                        onChange={e=>setParentWithValidation(inst.id,inst.parentId,e.target.value)}>
                        <option value="">—</option>
                        {availableOutlets.map(o=>{const mismatch=type?.feedConnector&&o.connector!==type.feedConnector;return <option key={o.id} value={o.id}>{o.label} ({o.amp}A){mismatch?" [Adapter!]":""}</option>;})}
                      </select>
                    </td>
                    <td style={S.td}>
                      {isRoot ? (
                        <select style={S.selectSm} value={inst.mainConnectionId||""} onChange={e=>updateInstance(inst.id,{mainConnectionId:e.target.value||null})}>
                          <option value="">— frei —</option>
                          {mainConns.map(mc=><option key={mc.id} value={mc.id}>{mc.name}</option>)}
                        </select>
                      ) : <span style={{color:"#555",fontSize:11}}>via Parent</span>}
                    </td>
                    <td style={S.td}><button style={S.dangerBtn} onClick={()=>{if(confirm(`Kasten „${inst.name}" wirklich löschen? Alle Steckungen dieses Kastens gehen verloren.`))removeInstance(inst.id);}}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        {instances.length>0&&<div style={{marginTop:8,display:"flex",justifyContent:"flex-end"}}>
          <button style={S.dangerBtn} onClick={clearAllInstances}>Alle Kästen löschen</button>
        </div>}
        <p style={S.hint}>💡 Phasen bleiben beim Aufstecken erhalten (L1→L1). Beim Aufstecken auf kleineren Anschluss erscheint eine Warnung.</p>
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Steckplan
══════════════════════════════════════════════════════════════════════════ */
function PlanTab({ instances,boxTypeById,loads,loadById,instById,placements,addPlacement,addPlacementsFilled,updatePlacement,removePlacement,activePlan,setActivePlan,ownLoad,totalLoad,isOverloaded,isUnderdimensioned,isAdapted,rootInstances,mainConns,mainConnById,meta }) {
  const [bulkLoadId,  setBulkLoadId]  = useState("");
  const [bulkOutletId,setBulkOutletId]= useState("");
  const [bulkCount,   setBulkCount]   = useState(1);
  // Nur Kästen anzeigen, die an einem Hauptanschluss oder an einem anderen Kasten hängen
  const activeInstances = instances.filter(i=>i.mainConnectionId||i.parentId);

  useEffect(()=>{
    if(activeInstances.length&&(!activePlan||!activeInstances.find(i=>i.id===activePlan)))
      setActivePlan(activeInstances[0].id);
  },[activeInstances,activePlan,setActivePlan]);

  if(instances.length===0)
    return <Section title="Steckplan"><p style={S.empty}>Aktiviere zuerst Kästen unter „1 · Konfiguration".</p></Section>;

  if(activeInstances.length===0)
    return <Section title="Steckplan"><p style={S.empty}>Keine Kästen angeschlossen. Bitte unter „1 · Konfiguration" Kästen an einen Hauptanschluss oder anderen Kasten anschließen.</p></Section>;

  const inst   = activeInstances.find(i=>i.id===activePlan)||activeInstances[0];
  const type   = boxTypeById[inst.typeId];
  const rows   = placements.filter(p=>p.instanceId===inst.id);
  const own    = ownLoad(inst.id);
  const tot    = totalLoad(inst.id);
  const maxA   = type?.feedAmp||0;
  const connLabel = type?(CONN[type.feedConnector]?.label||""):"";

  // Sorted outlet list for this kasten (schuko first)
  const sortedOutlets = type ? sortOutlets(type.outlets) : [];

  const getAvailableOutlets=(loadId)=>{
    const load=loadById[loadId];
    if(!load) return sortedOutlets;
    return load.threePhase ? sortedOutlets.filter(o=>is3ph(o.connector)) : sortedOutlets.filter(o=>!is3ph(o.connector));
  };

  const sortedLoads=alphaSort(loads,"name");
  const loadOptions=sortedLoads.map(l=>({ value:l.id, label:`${l.name} (${l.watt||"?"}W${l.threePhase?" 3ph":""})` }));

  // Compute per-mainConn totals for header
  const mainConnTotals = mainConns.map(mc=>{
    const connInsts=rootInstances.filter(i=>i.mainConnectionId===mc.id);
    const tot2={L1:0,L2:0,L3:0};
    connInsts.forEach(i=>{ const t=totalLoad(i.id); tot2.L1+=t.L1; tot2.L2+=t.L2; tot2.L3+=t.L3; });
    return { mc, tot: tot2 };
  });

  return (
    <div>
      {/* Header: Hauptanschlüsse */}
      {(mainConns.length>0||rootInstances.length>0) && (
        <Section title="Hauptanschlüsse – Gesamtlast">
          {mainConnTotals.map(({mc,tot:t})=>(
            <div key={mc.id} style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>{mc.name}{mc.amp?<span style={{fontWeight:400,color:"#9aa4af",fontSize:12}}> (max {mc.amp}A)</span>:""}</div>
              <div style={S.phaseBar}>
                {PHASES.map(ph=>{
                  const a=t[ph]; const pct=mc.amp?(a/mc.amp)*100:0;
                  const col=pct>100?"#c0392b":pct>80?"#e67e22":"#27ae60";
                  return (
                    <div key={ph} style={S.phaseBox}>
                      <div style={S.phaseLabel}>{ph}</div>
                      <div style={{...S.phaseVal,color:col}}>{round2(a)} A</div>
                      <div style={S.phaseTrack}><div style={{...S.phaseFill,width:`${Math.min(pct,100)}%`,background:col}}/></div>
                      <div style={S.phasePct}>{mc.amp?`${Math.round(pct)}% von ${mc.amp}A`:""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Free root instances (no mainConn assigned) */}
          {rootInstances.filter(i=>!i.mainConnectionId).map(ri=>{
            const rt=totalLoad(ri.id); const rType=boxTypeById[ri.typeId]; const rMax=rType?.feedAmp||0;
            return (
              <div key={ri.id} style={{marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:6,color:"#9aa4af"}}>{ri.name} <span style={{fontWeight:400,fontSize:11}}>(kein Hauptanschluss zugewiesen)</span></div>
                <div style={S.phaseBar}>
                  {PHASES.map(ph=>{
                    const a=rt[ph]; const pct=rMax?(a/rMax)*100:0;
                    const col=pct>100?"#c0392b":pct>80?"#e67e22":"#27ae60";
                    return (
                      <div key={ph} style={S.phaseBox}>
                        <div style={S.phaseLabel}>{ph}</div>
                        <div style={{...S.phaseVal,color:col,fontSize:16}}>{round2(a)} A</div>
                        <div style={S.phaseTrack}><div style={{...S.phaseFill,width:`${Math.min(pct,100)}%`,background:col}}/></div>
                        <div style={S.phasePct}>{rMax?`${Math.round(pct)}% von ${rMax}A`:""}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* Kasten tabs */}
      <div style={S.boxTabs}>
        {activeInstances.map(i=>{
          const ol=isOverloaded(i.id);
          const ud=isUnderdimensioned(i.id);
          const ad=isAdapted(i.id);
          return (
            <button key={i.id} style={{...S.boxTab,...(i.id===inst.id?S.boxTabActive:{}),...(ol?{borderColor:"#e74c3c"}:ud?{borderColor:"#f5a623"}:ad?{borderColor:"#a78bfa"}:{})}} onClick={()=>setActivePlan(i.id)}>
              {ol&&<span title="Überlastet!" style={{color:"#e74c3c",marginRight:4,fontWeight:800}}>⚠</span>}
              {!ol&&ud&&<span title="Unterdimensioniert!" style={{color:"#f5a623",marginRight:4,fontWeight:800}}>⚡</span>}
              {!ol&&!ud&&ad&&<span title="Adapter!" style={{color:"#a78bfa",marginRight:4,fontWeight:800}}>🔌</span>}
              {i.name}
            </button>
          );
        })}
      </div>

      <Section title={inst.name} subtitle={`Eingang: ${connLabel} (${maxA}A)`}>
        {/* Sticky phase bars */}
        <div style={S.stickyPhase}>
          <div style={S.phaseBar}>
            {PHASES.map(ph=>{
              const a=own[ph]; const tA=tot[ph];
              const pct=maxA?(tA/maxA)*100:0;
              const col=pct>100?"#c0392b":pct>80?"#e67e22":"#27ae60";
              return (
                <div key={ph} style={S.phaseBox}>
                  <div style={S.phaseLabel}>{ph}</div>
                  <div style={{...S.phaseVal,color:col}}>{round2(tA)} A</div>
                  <div style={S.phaseTrack}><div style={{...S.phaseFill,width:`${Math.min(pct,100)}%`,background:col}}/></div>
                  <div style={S.phasePct}>{maxA?`${Math.round(pct)}% von ${maxA}A`:""}</div>
                  {a!==tA&&<div style={{fontSize:10,color:"#555",marginTop:2}}>Eigen: {round2(a)}A</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Schnellerfassung ─────────────────────────────────────────── */}
        {(()=>{
          const bulkLoad=bulkLoadId?loadById[bulkLoadId]:null;
          const bulkAvail=bulkLoad?getAvailableOutlets(bulkLoadId):sortedOutlets;
          const bulkOutletOpts=bulkAvail.map(o=>({value:o.id,label:`${o.label} (${CONN[o.connector]?.label||o.connector} · ${o.breaker||""}${o.amp}A · ${o.protection})`}));
          const canAdd=!!bulkLoadId;
          // MC-Auto-Slot: nächster freier Slot berechnen
          const bulkOutletObj=bulkOutletId?type?.outlets.find(o=>o.id===bulkOutletId):null;
          const isBulkMC=bulkOutletObj&&isMulticore(bulkOutletObj.connector);
          const getNextMcSlot=(outletId)=>{
            const used=rows.filter(p=>p.outletId===outletId&&p.mcSlot!=null).map(p=>p.mcSlot);
            if(!used.length) return 1;
            return Math.max(...used)+1;
          };
          return (
            <div style={{display:"flex",alignItems:"flex-end",gap:8,marginTop:14,padding:"10px 12px",background:"#1b2026",borderRadius:7,border:`1px solid ${LINE}`,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#9aa4af",fontWeight:600,width:"100%",marginBottom:2}}>Schnellerfassung</span>
              <div style={{flex:"2 1 200px"}}>
                <div style={S.fieldLabel}>Anschluss</div>
                <FilterSelect options={bulkOutletOpts} value={bulkOutletId} onChange={v=>{setBulkOutletId(v);}} placeholder="Wählen…"/>
              </div>
              <div style={{flex:"2 1 180px"}}>
                <div style={S.fieldLabel}>Verbraucher</div>
                <InlineSelect options={loadOptions} value={bulkLoadId} onChange={v=>{setBulkLoadId(v);setBulkOutletId("");}} placeholder="Wählen…"/>
              </div>
              <div style={{width:70}}>
                <div style={S.fieldLabel}>Menge</div>
                <input type="number" min="1" max="50" style={{...S.inputSm,width:"100%",textAlign:"center"}} value={bulkCount} onChange={e=>setBulkCount(Math.max(1,parseInt(e.target.value)||1))}/>
              </div>
              <button style={{...S.primaryBtn,alignSelf:"flex-end"}} disabled={!canAdd}
                onClick={()=>{
                  const n=Math.max(1,Math.min(50,bulkCount));
                  const startSlot=isBulkMC?getNextMcSlot(bulkOutletId):null;
                  addPlacementsFilled(inst.id,bulkLoadId,bulkOutletId,n,startSlot);
                }}>
                {bulkCount>1?`${bulkCount}× hinzufügen`:"Hinzufügen"}
              </button>
              <button style={{...S.ghostBtn,alignSelf:"flex-end"}} onClick={()=>addPlacement(inst.id)} title="Leere Zeile hinzufügen">+ leer</button>
            </div>
          );
        })()}

        {rows.length===0 ? <p style={S.empty}>Noch nichts gesteckt.</p> : (
          <div style={{overflowX:"auto"}}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Anschluss</th><th style={S.th}>Steckplatz</th><th style={S.th}>Verbraucher</th>
              <th style={S.th}>Phase</th><th style={S.th}>W</th><th style={S.th}>A</th><th style={S.th}></th>
            </tr></thead>
            <tbody>
              {rows.map(p=>{
                const l=loadById[p.loadId];
                const outlet=type?.outlets.find(o=>o.id===p.outletId);
                const avail=getAvailableOutlets(p.loadId);
                const outletOptions=avail.map(o=>({
                  value:o.id,
                  label:`${o.label} (${CONN[o.connector]?.label||o.connector} · ${o.breaker}${o.amp}A · ${o.protection})`,
                }));
                // Phase display
                let phDisplay="—";
                if(l?.threePhase) phDisplay="L1+L2+L3";
                else if(outlet&&isMulticore(outlet.connector)&&p.mcSlot) phDisplay=PHASES[(p.mcSlot-1)%3];
                else if(outlet) phDisplay=outlet.phase||"—";
                const amp=l&&l.watt?round2(l.watt/VOLT):"";
                // Multicore slot options
                const showMcSlot=outlet&&isMulticore(outlet.connector);
                const mcOptions=showMcSlot?mcSlotOptions(outlet):[];
                return (
                  <tr key={p.id}>
                    <td style={S.td}>
                      <FilterSelect options={outletOptions} value={p.outletId} onChange={v=>updatePlacement(p.id,{outletId:v,mcSlot:null})} placeholder="Anschluss…" style={{minWidth:200}}/>
                    </td>
                    <td style={S.td}>
                      {showMcSlot ? (
                        <select style={{...S.selectSm,width:120}} value={p.mcSlot||""} onChange={e=>updatePlacement(p.id,{mcSlot:e.target.value?Number(e.target.value):null})}>
                          <option value="">— wählen —</option>
                          {mcOptions.map(s=><option key={s.slotNum} value={s.slotNum}>Steckplatz {s.slotNum} ({s.phase})</option>)}
                        </select>
                      ) : <span style={{color:"#555",fontSize:11}}>—</span>}
                    </td>
                    <td style={S.td}>
                      <InlineSelect options={loadOptions} value={p.loadId} onChange={v=>updatePlacement(p.id,{loadId:v,outletId:"",mcSlot:null})} placeholder="Verbraucher…" style={{minWidth:180}}/>
                    </td>
                    <td style={S.td}><span style={{fontSize:12,color:phDisplay==="—"?"#555":"#fff"}}>{phDisplay}</span></td>
                    <td style={S.td}>{l?l.watt:"-"}</td>
                    <td style={S.td}>{amp?(l?.threePhase?`${amp}/Ph`:amp):"-"}</td>
                    <td style={S.td}><button style={S.dangerBtn} onClick={()=>removePlacement(p.id)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Kasten-Typen
══════════════════════════════════════════════════════════════════════════ */
function BoxTypesTab({ boxTypes,setBoxTypes,instances }) {
  const [openId,setOpenId]=useState(null);
  const [bulk,setBulk]=useState({count:1,connector:"SCHUKO",amp:16,phase:"L1",breaker:"C",protection:"RCBO",rcdId:null,rotatePhase:false});
  const updBulk=(patch)=>setBulk(s=>{
    const n={...s,...patch};
    if(patch.connector){ n.amp=CONN[patch.connector]?.amp||n.amp; n.phase=is3ph(patch.connector)?"L1L2L3":isMulticore(patch.connector)?"L1":(n.phase==="L1L2L3"?"L1":n.phase); }
    return n;
  });
  const update=(id,patch)=>setBoxTypes(s=>s.map(b=>b.id===id?{...b,...patch}:b));
  const updateOutlet=(boxId,outletId,patch)=>{
    setBoxTypes(s=>s.map(b=>{
      if(b.id!==boxId) return b;
      return {...b,outlets:b.outlets.map(o=>{
        if(o.id!==outletId) return o;
        const upd={...o,...patch};
        const box=s.find(bb=>bb.id===boxId);
        if(box&&upd.amp>box.feedAmp){ alert(`Anschluss (${upd.amp}A) kann Einspeisung (${box.feedAmp}A) nicht übersteigen.`); return o; }
        if(patch.connector){
          upd.phase=is3ph(patch.connector)?"L1L2L3":(o.phase==="L1L2L3"?"L1":o.phase);
          upd.amp=CONN[patch.connector]?.amp||upd.amp;
          if(isMulticore(patch.connector)&&!upd.mcSlots) upd.mcSlots=6;
          if(!isMulticore(patch.connector)) upd.mcSlots=undefined;
        }
        return upd;
      })};
    }));
  };
  const addOutlet=(boxId)=>setBoxTypes(s=>s.map(b=>b.id!==boxId?b:{...b,outlets:[...b.outlets,{id:uid(),label:`Anschluss ${b.outlets.length+1}`,connector:"SCHUKO",amp:16,phase:"L1",breaker:"C",protection:"RCBO",rcdId:null}]}));
  const removeOutlet=(boxId,outletId)=>setBoxTypes(s=>s.map(b=>b.id!==boxId?b:{...b,outlets:b.outlets.filter(o=>o.id!==outletId)}));
  const addType=()=>{ const id="NEU_"+uid(); setBoxTypes(s=>[{id,name:"Neuer Kasten",feedConnector:"CEE32",feedAmp:32,rcds:[],outlets:[]},...s]); setOpenId(id); };
  const removeType=(id)=>{ if(instances.some(i=>i.typeId===id)){alert("Kasten-Typ ist in Benutzung und kann nicht gelöscht werden.");return;} if(!confirm("Kasten-Typ wirklich löschen?"))return; setBoxTypes(s=>s.filter(b=>b.id!==id)); };
  const removeAllTypes=()=>{
    const inUse=boxTypes.filter(b=>instances.some(i=>i.typeId===b.id));
    const free=boxTypes.filter(b=>!instances.some(i=>i.typeId===b.id));
    if(free.length===0){alert("Alle Typen sind in Benutzung und können nicht gelöscht werden.");return;}
    const msg=inUse.length>0
      ?`${free.length} Typen löschen? (${inUse.length} in Benutzung werden übersprungen)`
      :`Alle ${free.length} Kasten-Typen löschen?`;
    if(!confirm(msg))return;
    setBoxTypes(s=>s.filter(b=>instances.some(i=>i.typeId===b.id)));
    setOpenId(null);
  };
  const addRcd=(boxId)=>setBoxTypes(s=>s.map(b=>b.id!==boxId?b:{...b,rcds:[...(b.rcds||[]),{id:uid(),label:"RCD",mA:30}]}));
  const updateRcd=(boxId,rcdId,patch)=>setBoxTypes(s=>s.map(b=>b.id!==boxId?b:{...b,rcds:(b.rcds||[]).map(r=>r.id===rcdId?{...r,...patch}:r)}));
  const removeRcd=(boxId,rcdId)=>{
    if(!confirm("RCD-Gruppe loeschen? Zugeordnete Anschluesse verlieren ihre RCD-Zuordnung."))return;
    setBoxTypes(s=>s.map(b=>{
      if(b.id!==boxId) return b;
      return {...b,rcds:(b.rcds||[]).filter(r=>r.id!==rcdId),outlets:b.outlets.map(o=>o.rcdId===rcdId?{...o,rcdId:null}:o)};
    }));
  };

  const exportBoxTypes=()=>downloadJSON({_format:"stromplaner-boxtypes",boxTypes},"Kasten-Typen.json");
  const importBoxTypes=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const r=new FileReader(); r.onload=(ev)=>{
      try {
        const d=JSON.parse(ev.target.result);
        if(d._format!=="stromplaner-boxtypes"&&d._format!=="stromplaner"){ alert("Kein gültiger Kasten-Typen-Export."); return; }
        const imported=(d.boxTypes||[]).map(migrateBoxType);
        setBoxTypes(s=>{ const ids=new Set(s.map(b=>b.id)); const neu=imported.filter(b=>!ids.has(b.id)); alert(`${neu.length} Kasten-Typen hinzugefügt.`); return alphaSort([...neu,...s],"name"); });
      } catch(err){ alert("Fehler: "+err.message); }
    }; r.readAsText(file); e.target.value="";
  };

  return (
    <Section title="Kasten-Typen" subtitle="Jeder physische Steckplatz = ein Anschluss. Bei Multicore: Steckplatzanzahl konfigurierbar, Phase rotiert automatisch (L1/L2/L3).">
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
        <button style={S.primaryBtn} onClick={addType}>+ Neuen Kasten-Typ</button>
        <button style={S.ghostBtn} onClick={exportBoxTypes}>⬇ Exportieren</button>
        <label style={S.ghostBtn}>↥ Importieren<input type="file" accept=".json" onChange={importBoxTypes} style={{display:"none"}}/></label>
        {boxTypes.length>0&&<button style={S.dangerBtn} onClick={removeAllTypes}>Alle löschen</button>}
      </div>
      <div style={{marginTop:16}}>
        {boxTypes.map(b=>(
          <div key={b.id} style={S.card}>
            <div style={S.cardHead} onClick={()=>setOpenId(openId===b.id?null:b.id)}>
              <span style={S.cardTitle}>{openId===b.id?"▾":"▸"} {b.name}</span>
              <span style={S.cardSub}>{CONN[b.feedConnector]?.label||b.feedConnector} · {b.outlets.length} Anschlüsse</span>
            </div>
            {openId===b.id&&(
              <div style={S.cardBody}>
                <div style={S.metaGrid}>
                  <Field label="Name"><input style={S.input} value={b.name} onChange={e=>update(b.id,{name:e.target.value})}/></Field>
                  <Field label="Einspeisung">
                    <select style={S.input} value={b.feedConnector} onChange={e=>update(b.id,{feedConnector:e.target.value,feedAmp:CONN[e.target.value]?.amp||b.feedAmp})}>
                      {CONN_SORTED_ENTRIES.map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Max (A)"><input type="number" style={S.input} value={b.feedAmp} onChange={e=>update(b.id,{feedAmp:+e.target.value})}/></Field>
                </div>
                <div style={{textAlign:"right",marginTop:4}}>
                  <button style={S.dangerBtnWide} onClick={()=>removeType(b.id)}>Löschen</button>
                </div>

                {/* RCD-Gruppen */}
                <div style={{marginTop:12,marginBottom:10,padding:"8px 10px",background:"#1b2026",borderRadius:5,border:"1px solid #2e3540"}}>
                  <p style={{fontSize:11,color:"#9aa4af",margin:"0 0 8px",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>RCD-Gruppen</p>
                  {(b.rcds||[]).length===0
                    ? <p style={{...S.hint,margin:"0 0 6px"}}>Keine RCD-Gruppen — Anschlüsse werden nur per LS / RCBO geschützt.</p>
                    : <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                        {(b.rcds||[]).map(rcd=>(
                          <div key={rcd.id} style={{display:"flex",gap:4,alignItems:"center",background:"#252b33",border:"1px solid #3a424c",borderRadius:5,padding:"4px 6px"}}>
                            <input style={{...S.inputSm,width:120}} value={rcd.label} placeholder="Bezeichnung" onChange={e=>updateRcd(b.id,rcd.id,{label:e.target.value})}/>
                            <input type="number" min={10} max={500} style={{...S.inputSm,width:58}} value={rcd.mA} onChange={e=>updateRcd(b.id,rcd.id,{mA:+e.target.value})}/>
                            <span style={{fontSize:10,color:"#7c8794",whiteSpace:"nowrap"}}>mA</span>
                            <button style={S.dangerBtn} onClick={()=>removeRcd(b.id,rcd.id)}>✕</button>
                          </div>
                        ))}
                      </div>
                  }
                  <button style={S.secondaryBtn} onClick={()=>addRcd(b.id)}>+ RCD hinzufügen</button>
                </div>

                <div style={{overflowX:"auto"}}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Name / Steckplatz</th><th style={S.th}>Stecker</th><th style={S.th}>A</th>
                    <th style={S.th}>Phase</th><th style={S.th}>Steckpl.*</th><th style={S.th}>Sich.</th><th style={S.th}>Schutz</th><th style={S.th}>RCD-Gruppe</th><th style={S.th}></th>
                  </tr></thead>
                  <tbody>
                    {b.outlets.map(o=>(
                      <tr key={o.id}>
                        <td style={S.td}><input style={S.inputSm} value={o.label} onChange={e=>updateOutlet(b.id,o.id,{label:e.target.value})}/></td>
                        <td style={S.td}>
                          <select style={S.selectSm} value={o.connector} onChange={e=>updateOutlet(b.id,o.id,{connector:e.target.value})}>
                            {CONN_SORTED_ENTRIES.map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td style={S.td}><input type="number" style={{...S.inputSm,width:55}} value={o.amp} onChange={e=>updateOutlet(b.id,o.id,{amp:+e.target.value})}/></td>
                        <td style={S.td}>
                          {is3ph(o.connector)?<span style={{color:"#9aa4af",fontSize:11}}>L1+L2+L3</span>:
                           isMulticore(o.connector)?<span style={{color:"#9aa4af",fontSize:11}}>rotiert</span>:(
                            <select style={{...S.selectSm,width:60}} value={o.phase||"L1"} onChange={e=>updateOutlet(b.id,o.id,{phase:e.target.value})}>
                              {PHASES.map(ph=><option key={ph} value={ph}>{ph}</option>)}
                            </select>
                          )}
                        </td>
                        <td style={S.td}>
                          {isMulticore(o.connector)?
                            <input type="number" min={1} max={48} style={{...S.inputSm,width:55}} value={o.mcSlots||6} onChange={e=>updateOutlet(b.id,o.id,{mcSlots:+e.target.value})}/>:
                            <span style={{color:"#555",fontSize:11}}>—</span>}
                        </td>
                        <td style={S.td}><select style={{...S.selectSm,width:55}} value={o.breaker||"C"} onChange={e=>updateOutlet(b.id,o.id,{breaker:e.target.value})}>{BREAKER_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></td>
                        <td style={S.td}><select style={{...S.selectSm,width:70}} value={o.protection||"LS"} onChange={e=>updateOutlet(b.id,o.id,{protection:e.target.value})}>{PROTECTION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></td>
                        <td style={S.td}>
                          {(b.rcds||[]).length>0
                            ? <select style={{...S.selectSm,width:100}} value={o.rcdId||""} onChange={e=>updateOutlet(b.id,o.id,{rcdId:e.target.value||null})}>
                                <option value="">— kein —</option>
                                {(b.rcds||[]).map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                              </select>
                            : <span style={{color:"#555",fontSize:11}}>—</span>}
                        </td>
                        <td style={S.td}><button style={S.dangerBtn} onClick={()=>removeOutlet(b.id,o.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <p style={{...S.hint,marginTop:6}}>* Steckplätze gilt nur für Multicore-Anschlüsse. Phase rotiert automatisch: Steckplatz 1=L1, 2=L2, 3=L3, 4=L1, …</p>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginTop:10,padding:"8px 10px",background:"#1b2026",borderRadius:5,border:"1px solid #2e3540"}}>
                  <span style={{fontSize:11,color:"#9aa4af",fontWeight:600,marginRight:2}}>Bulk:</span>
                  <input type="number" min={1} max={48} style={{...S.inputSm,width:46}} value={bulk.count} onChange={e=>updBulk({count:Math.max(1,+e.target.value)})} title="Anzahl"/>
                  <select style={S.selectSm} value={bulk.connector} onChange={e=>updBulk({connector:e.target.value})}>
                    {CONN_SORTED_ENTRIES.map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input type="number" style={{...S.inputSm,width:52}} value={bulk.amp} onChange={e=>updBulk({amp:+e.target.value})} title="Ampere"/>
                  <span style={{fontSize:11,color:"#7c8794"}}>A</span>
                  {!is3ph(bulk.connector)&&!isMulticore(bulk.connector)&&(<>
                    <select style={{...S.selectSm,width:55}} value={bulk.phase} onChange={e=>updBulk({phase:e.target.value})} disabled={bulk.rotatePhase}>
                      {PHASES.map(ph=><option key={ph} value={ph}>{ph}</option>)}
                    </select>
                    <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:bulk.rotatePhase?"#f5a623":"#9aa4af",cursor:"pointer",userSelect:"none"}} title="Phasen gleichmäßig rotieren (L1→L2→L3→…)">
                      <input type="checkbox" checked={bulk.rotatePhase} onChange={e=>updBulk({rotatePhase:e.target.checked})} style={{cursor:"pointer"}}/>
                      Rotation
                    </label>
                  </>)}
                  <select style={{...S.selectSm,width:52}} value={bulk.breaker} onChange={e=>updBulk({breaker:e.target.value})}>
                    {BREAKER_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  <select style={{...S.selectSm,width:72}} value={bulk.protection} onChange={e=>updBulk({protection:e.target.value})}>
                    {PROTECTION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  {(b.rcds||[]).length>0&&(
                    <select style={{...S.selectSm,width:100}} value={bulk.rcdId||""} onChange={e=>updBulk({rcdId:e.target.value||null})} title="RCD-Gruppe">
                      <option value="">— kein RCD —</option>
                      {(b.rcds||[]).map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  )}
                  <button style={S.secondaryBtn} onClick={()=>{
                    const base=b.outlets.length;
                    const phaseFor=(i)=>{
                      if(is3ph(bulk.connector)) return "L1L2L3";
                      if(isMulticore(bulk.connector)) return "L1";
                      if(bulk.rotatePhase) return PHASES[(base+i)%PHASES.length];
                      return bulk.phase;
                    };
                    const neu=Array.from({length:bulk.count},(_,i)=>({
                      id:uid(),
                      label:`Anschluss ${base+i+1}`,
                      connector:bulk.connector,
                      amp:bulk.amp,
                      phase:phaseFor(i),
                      breaker:bulk.breaker,
                      protection:bulk.protection,
                      rcdId:bulk.rcdId,
                      ...(isMulticore(bulk.connector)?{mcSlots:6}:{})
                    }));
                    setBoxTypes(s=>s.map(bx=>bx.id!==b.id?bx:{...bx,outlets:[...bx.outlets,...neu]}));
                  }}>+ {bulk.count}×</button>
                </div>
                <button style={{...S.secondaryBtn,marginTop:6}} onClick={()=>addOutlet(b.id)}>+ Einzeln hinzufügen</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Verbraucher
══════════════════════════════════════════════════════════════════════════ */
function LoadsTab({ loads,setLoads }) {
  const add=()=>setLoads(s=>[{id:uid(),name:"Neuer Verbraucher",watt:"",threePhase:false},...s]);
  const update=(id,patch)=>setLoads(s=>s.map(l=>l.id===id?{...l,...patch}:l));
  const remove=(id)=>setLoads(s=>s.filter(l=>l.id!==id));

  const exportLoads=()=>downloadJSON({_format:"stromplaner-loads",loads},"Verbraucher.json");
  const importLoads=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const r=new FileReader(); r.onload=(ev)=>{
      try {
        const d=JSON.parse(ev.target.result);
        if(d._format!=="stromplaner-loads"&&d._format!=="stromplaner"){ alert("Kein gültiger Verbraucher-Export."); return; }
        const imported=(d.loads||[]);
        setLoads(s=>{ const ids=new Set(s.map(l=>l.id)); const neu=imported.filter(l=>!ids.has(l.id)).map(l=>({...l,threePhase:l.threePhase||false})); alert(`${neu.length} Verbraucher hinzugefügt.`); return [...neu,...s]; });
      } catch(err){ alert("Fehler: "+err.message); }
    }; r.readAsText(file); e.target.value="";
  };

  return (
    <Section title="Verbraucher-Stammdaten" subtitle="3-phasige Verbraucher werden gleichmäßig auf L1/L2/L3 verteilt und können nur auf CEE-Rot / Powerlock Anschlüsse gesteckt werden.">
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
        <button style={S.primaryBtn} onClick={add}>+ Verbraucher</button>
        <button style={S.ghostBtn} onClick={exportLoads}>⬇ Exportieren</button>
        <label style={S.ghostBtn}>↥ Importieren<input type="file" accept=".json" onChange={importLoads} style={{display:"none"}}/></label>
      </div>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Name</th><th style={S.th}>W</th><th style={S.th}>A</th><th style={S.th}>3-phasig</th><th style={S.th}></th></tr></thead>
        <tbody>
          {loads.map(l=>(
            <tr key={l.id}>
              <td style={S.td}><input style={S.inputSm} value={l.name} onChange={e=>update(l.id,{name:e.target.value})}/></td>
              <td style={S.td}><input type="number" style={{...S.inputSm,width:90}} value={l.watt} onChange={e=>update(l.id,{watt:e.target.value===""?"":+e.target.value})}/></td>
              <td style={S.td}>{l.watt?(l.threePhase?`${round2(l.watt/VOLT)}/Ph`:round2(l.watt/VOLT)):""}</td>
              <td style={S.td}><input type="checkbox" checked={l.threePhase||false} onChange={e=>update(l.id,{threePhase:e.target.checked})}/></td>
              <td style={S.td}><button style={S.dangerBtn} onClick={()=>remove(l.id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Übersicht
══════════════════════════════════════════════════════════════════════════ */
function OverviewTab({ instances,instById,boxTypeById,totalLoad,rootInstances,mainConns,mainConnById,meta,isOverloaded,isUnderdimensioned,isAdapted,placements,loads,loadById }) {
  if(instances.length===0) return <Section title="Übersicht"><p style={S.empty}>Noch keine Kästen aktiviert.</p></Section>;
  return (
    <div>
      <Section title="Hauptanschlüsse" subtitle="Summenlast aller zugewiesenen Kästen je Hauptanschluss.">
        {mainConns.map(mc=>{
          const connInsts=rootInstances.filter(i=>i.mainConnectionId===mc.id);
          const tot={L1:0,L2:0,L3:0};
          connInsts.forEach(i=>{ const t=totalLoad(i.id); tot.L1+=t.L1; tot.L2+=t.L2; tot.L3+=t.L3; });
          return (
            <div key={mc.id} style={S.rootCard}>
              <div style={S.rootTitle}>{mc.name}{mc.amp&&<span style={S.rootSub}> (max {mc.amp}A)</span>}</div>
              <div style={{fontSize:12,color:"#9aa4af",marginBottom:8}}>Kästen: {connInsts.map(i=>i.name).join(", ")||"—"}</div>
              <div style={S.phaseBar}>
                {PHASES.map(ph=>{
                  const a=tot[ph]; const pct=mc.amp?(a/mc.amp)*100:0;
                  const col=pct>100?"#c0392b":pct>80?"#e67e22":"#27ae60";
                  return (
                    <div key={ph} style={S.phaseBox}>
                      <div style={S.phaseLabel}>{ph}</div>
                      <div style={{...S.phaseVal,color:col}}>{round2(a)} A</div>
                      <div style={S.phaseTrack}><div style={{...S.phaseFill,width:`${Math.min(pct,100)}%`,background:col}}/></div>
                      <div style={S.phasePct}>{mc.amp?`${Math.round(pct)}%`:""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {rootInstances.filter(i=>!i.mainConnectionId).map(ri=>{
          const t=totalLoad(ri.id); const type=boxTypeById[ri.typeId]; const maxA=type?.feedAmp||0;
          return (
            <div key={ri.id} style={{...S.rootCard,borderColor:LINE}}>
              <div style={{...S.rootTitle,color:"#9aa4af"}}>{ri.name} <span style={S.rootSub}>(kein Hauptanschluss)</span></div>
              <div style={S.phaseBar}>
                {PHASES.map(ph=>{ const a=t[ph]; const pct=maxA?(a/maxA)*100:0; const col=pct>100?"#c0392b":pct>80?"#e67e22":"#27ae60";
                  return <div key={ph} style={S.phaseBox}><div style={S.phaseLabel}>{ph}</div><div style={{...S.phaseVal,color:col}}>{round2(a)} A</div><div style={S.phaseTrack}><div style={{...S.phaseFill,width:`${Math.min(pct,100)}%`,background:col}}/></div></div>; })}
              </div>
            </div>
          );
        })}
      </Section>
      <Section title="Alle Kästen">
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}></th><th style={S.th}>Kasten</th><th style={S.th}>Eingang</th>
            <th style={S.th}>hängt an</th><th style={S.th}>L1(A)</th><th style={S.th}>L2(A)</th><th style={S.th}>L3(A)</th>
            <th style={S.th}>Max(A)</th><th style={S.th}>Status</th>
          </tr></thead>
          <tbody>
            {instances.map(inst=>{
              const t=totalLoad(inst.id); const type=boxTypeById[inst.typeId]; const maxA=type?.feedAmp||0;
              const peak=Math.max(t.L1,t.L2,t.L3); const pct=maxA?(peak/maxA)*100:0;
              const conn=type?(CONN[type.feedConnector]?.label||""):"";
              const stat=pct>100?"⚠ ÜBERLAST":pct>80?"●>80%":peak>0?"✓ OK":"–";
              const scol=pct>100?"#c0392b":pct>80?"#e67e22":peak>0?"#27ae60":"#999";
              return (
                <tr key={inst.id}>
                  <td style={S.td}>
                    {pct>100&&<span title="Überlastet!" style={{color:"#e74c3c",fontWeight:800}}>⚠</span>}
                    {pct<=100&&isUnderdimensioned(inst.id)&&<span title="Unterdimensioniert!" style={{color:"#f5a623",fontWeight:800}}>⚡</span>}
                    {pct<=100&&!isUnderdimensioned(inst.id)&&isAdapted(inst.id)&&<span title="Adapter!" style={{color:"#a78bfa",fontWeight:800}}>🔌</span>}
                  </td>
                  <td style={S.td}>{inst.name}</td>
                  <td style={{...S.td,fontSize:11}}>{conn}</td>
                  <td style={S.td}>{inst.parentId?instById[inst.parentId]?.name:inst.mainConnectionId?mainConnById[inst.mainConnectionId]?.name:"— Einspeisung —"}</td>
                  <td style={S.td}>{round2(t.L1)}</td><td style={S.td}>{round2(t.L2)}</td><td style={S.td}>{round2(t.L3)}</td>
                  <td style={S.td}>{maxA}</td>
                  <td style={{...S.td,color:scol,fontWeight:600}}>{stat}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ── Verbraucher nach Typ ──────────────────────────────────────────── */}
      {(() => {
        const counts={};
        placements.forEach(p=>{
          if(!p.loadId) return;
          const l=loadById[p.loadId]; if(!l) return;
          if(!counts[p.loadId]) counts[p.loadId]={load:l,count:0};
          counts[p.loadId].count++;
        });
        const rows=Object.values(counts).sort((a,b)=>a.load.name.localeCompare(b.load.name,"de",{numeric:true}));
        if(!rows.length) return null;
        const totalW=rows.reduce((s,r)=>s+(r.load.watt||0)*r.count,0);
        return (
          <Section title="Verbraucher – Mengen nach Typ" subtitle="Alle platzierten Verbraucher, summiert nach Typ.">
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Verbraucher</th>
                <th style={{...S.th,textAlign:"right"}}>Menge</th>
                <th style={{...S.th,textAlign:"right"}}>W / Stk.</th>
                <th style={{...S.th,textAlign:"right"}}>Gesamt W</th>
                <th style={S.th}>3-Ph</th>
              </tr></thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.load.id}>
                    <td style={S.td}>{r.load.name}</td>
                    <td style={{...S.td,fontWeight:700,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{r.count}</td>
                    <td style={{...S.td,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{r.load.watt||"–"} W</td>
                    <td style={{...S.td,fontWeight:600,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{(r.load.watt||0)*r.count} W</td>
                    <td style={S.td}>{r.load.threePhase?"3ph":""}</td>
                  </tr>
                ))}
                <tr style={{borderTop:`2px solid #3a424c`}}>
                  <td style={{...S.td,fontWeight:700}}>Gesamt</td>
                  <td style={{...S.td,fontWeight:700,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{rows.reduce((s,r)=>s+r.count,0)}</td>
                  <td style={S.td}></td>
                  <td style={{...S.td,fontWeight:700,textAlign:"right",fontVariantNumeric:"tabular-nums",color:"#f5a623"}}>{totalW} W</td>
                  <td style={S.td}></td>
                </tr>
              </tbody>
            </table>
          </Section>
        );
      })()}

      {/* ── Verbraucher nach Kasten ───────────────────────────────────────── */}
      {(() => {
        const boxRows=instances.map(inst=>{
          const pl=placements.filter(p=>p.instanceId===inst.id&&p.loadId);
          if(!pl.length) return null;
          // Count per load type within this box
          const lc={};
          pl.forEach(p=>{ const l=loadById[p.loadId]; if(!l) return; if(!lc[p.loadId]) lc[p.loadId]={load:l,count:0}; lc[p.loadId].count++; });
          const rows=Object.values(lc).sort((a,b)=>a.load.name.localeCompare(b.load.name,"de",{numeric:true}));
          return {inst,rows,totalW:rows.reduce((s,r)=>s+(r.load.watt||0)*r.count,0)};
        }).filter(Boolean);
        if(!boxRows.length) return null;
        return (
          <Section title="Verbraucher nach Kasten" subtitle="Für jede Unterverteilung: platzierte Verbraucher mit Menge und Leistung.">
            {boxRows.map(({inst,rows,totalW})=>(
              <div key={inst.id} style={{marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:13,color:"#e8eaed",marginBottom:6}}>
                  {inst.name}
                  <span style={{fontWeight:400,fontSize:11,color:"#9aa4af",marginLeft:8}}>{boxTypeById[inst.typeId]?.name||""}</span>
                  <span style={{fontWeight:600,fontSize:11,color:"#f5a623",marginLeft:8}}>{totalW} W</span>
                </div>
                <table style={{...S.table,marginBottom:0}}>
                  <thead><tr>
                    <th style={S.th}>Verbraucher</th>
                    <th style={{...S.th,textAlign:"right"}}>Menge</th>
                    <th style={{...S.th,textAlign:"right"}}>W / Stk.</th>
                    <th style={{...S.th,textAlign:"right"}}>Gesamt W</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r=>(
                      <tr key={r.load.id}>
                        <td style={S.td}>{r.load.name}</td>
                        <td style={{...S.td,fontWeight:700,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{r.count}</td>
                        <td style={{...S.td,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{r.load.watt||"–"} W</td>
                        <td style={{...S.td,fontWeight:600,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{(r.load.watt||0)*r.count} W</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Section>
        );
      })()}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Schaltbild – Blockschaltbild mit IEC-Symbolen
══════════════════════════════════════════════════════════════════════════ */
function SchematicTab({ instances,instById,boxTypeById,rootInstances,mainConns,mainConnById,isAdapted,svgRef,placements,loadById }) {
  if(instances.length===0) return <Section title="Blockschaltbild"><p style={S.empty}>Aktiviere zuerst Kästen im Konfiguration-Tab.</p></Section>;

  /* ── Connector-Labels (sketchartig: Spannung + Phasigkeit) ───────────── */
  const connMid = (type) => ({
    CEE16:"CEE 16A 3L+N+PE",  CEE32:"CEE 32A 3L+N+PE",
    CEE63:"CEE 63A 3L+N+PE",  CEE125:"CEE 125A 3L+N+PE",
    CEE16_1:"CEE 16A L+N+PE", CEE32_1:"CEE 32A L+N+PE",
    PL125:"Powerlock 125A",   PL200:"Powerlock 200A", PL400:"Powerlock 400A",
    MC:"Multicore",           SCHUKO:"Schuko 16A",
  }[type] || type || "–");
  const connShort = (type) => ({
    CEE16:"CEE16",CEE32:"CEE32",CEE63:"CEE63",CEE125:"CEE125",
    CEE16_1:"CEE16 1ph",CEE32_1:"CEE32 1ph",
    PL125:"PL125",PL200:"PL200",PL400:"PL400",
    MC:"MC",SCHUKO:"Schuko",
  }[type] || type || "–");

  /* ── IEC 60309 Symbole (für Hauptanschluss-Visualisierung) ──────────── */
  const SymCEE3ph = ({x,y,s=1,col="#9aa4af"}) => (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <circle cx="10" cy="10" r="8.5" stroke={col} strokeWidth="1.4" fill="none"/>
      <rect x="8.7" y="17.6" width="2.6" height="1.8" rx="0.5" fill={col} opacity="0.7"/>
      <circle cx="10"   cy="14.5" r="2.0" fill={col}/>
      <circle cx="7.75" cy="6.1"  r="1.5" fill={col}/>
      <circle cx="14.5" cy="10"   r="1.5" fill={col}/>
      <circle cx="7.75" cy="13.9" r="1.5" fill={col}/>
      <circle cx="5.5"  cy="10"   r="1.3" fill={col} opacity="0.6"/>
    </g>
  );
  const SymCEE1ph = ({x,y,s=1,col="#9aa4af"}) => (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <circle cx="10" cy="10" r="8.5" stroke={col} strokeWidth="1.4" fill="none"/>
      <rect x="8.7" y="17.6" width="2.6" height="1.8" rx="0.5" fill={col} opacity="0.7"/>
      <circle cx="10"   cy="14.5" r="2.0" fill={col}/>
      <circle cx="6.1"  cy="7.75" r="1.6" fill={col}/>
      <circle cx="13.9" cy="7.75" r="1.6" fill={col}/>
    </g>
  );
  const SymSchuko = ({x,y,s=1,col="#9aa4af"}) => (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <circle cx="10" cy="10" r="8.5" stroke={col} strokeWidth="1.4" fill="none"/>
      <circle cx="10" cy="10" r="6.0" stroke={col} strokeWidth="0.6" fill="none" opacity="0.35"/>
      <circle cx="7.2"  cy="10.5" r="2.0" stroke={col} strokeWidth="1.1" fill="none"/>
      <circle cx="12.8" cy="10.5" r="2.0" stroke={col} strokeWidth="1.1" fill="none"/>
      <line x1="1.5"  y1="9.7"  x2="4.0"  y2="9.7"  stroke={col} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="1.5"  y1="11.3" x2="4.0"  y2="11.3" stroke={col} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="16.0" y1="9.7"  x2="18.5" y2="9.7"  stroke={col} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="16.0" y1="11.3" x2="18.5" y2="11.3" stroke={col} strokeWidth="1.3" strokeLinecap="round"/>
    </g>
  );
  const SymPowerlock = ({x,y,s=1,col="#9aa4af"}) => (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x="1.5" y="4.0" width="17" height="12" rx="2.5" stroke={col} strokeWidth="1.4" fill="none"/>
      <line x1="5.5"  y1="4.0" x2="5.5"  y2="1.5" stroke={col} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="14.5" y1="4.0" x2="14.5" y2="1.5" stroke={col} strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="10" cy="10" r="3.8" stroke={col} strokeWidth="1.3" fill="none"/>
      <circle cx="10" cy="10" r="1.4" fill={col}/>
    </g>
  );
  const SymMulticore = ({x,y,s=1,col="#9aa4af"}) => (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      {[3,6.5,10,13.5,17].map(cx=>(
        <line key={cx} x1={cx} y1="5" x2={cx} y2="14" stroke={col} strokeWidth="1.1"/>
      ))}
      <line x1="2" y1="5"  x2="18" y2="5"  stroke={col} strokeWidth="1.5"/>
      <rect x="4" y="14" width="12" height="3.5" rx="1.2" stroke={col} strokeWidth="1.1" fill="none"/>
    </g>
  );
  const connSym = (type) => {
    if(["CEE16","CEE32","CEE63","CEE125"].includes(type)) return SymCEE3ph;
    if(["CEE16_1","CEE32_1"].includes(type)) return SymCEE1ph;
    if(type==="SCHUKO") return SymSchuko;
    if(["PL125","PL200","PL400"].includes(type)) return SymPowerlock;
    if(type==="MC") return SymMulticore;
    return null;
  };

  /* ── Orthogonales Routing ────────────────────────────────────────────── */
  const orthoPath = (x1, y1, x2, y2) => {
    const mx=(x1+x2)/2, dy=y2-y1;
    if(Math.abs(dy)<2) return `M${x1} ${y1} H${x2}`;
    const r=Math.min(10,Math.abs(dy)/2), d=dy>0?1:-1;
    return [`M${x1} ${y1}`,`H${mx-r}`,
      `A${r} ${r} 0 0 ${d>0?1:0} ${mx} ${y1+d*r}`,
      `V${y2-d*r}`,
      `A${r} ${r} 0 0 ${d>0?0:1} ${mx+r} ${y2}`,
      `H${x2}`].join(" ");
  };

  /* ── MCB/RCD-Footer für einen Kasten berechnen ───────────────────────── */
  const footerLines = (inst) => {
    const type = boxTypeById[inst?.typeId];
    if(!type) return [];
    const outlets = type.outlets||[];
    const rcds    = type.rcds||[];
    // MCB-Gruppen: gruppiere nach Absicherung + Charakteristik + Phasigkeit
    const mcbMap = {};
    outlets.forEach(out=>{
      if(!out.breaker) return;
      const ph = is3ph(out.connector)?'3P':isMulticore(out.connector)?'MC':'1P';
      const prot = out.protection==='RCBO'?'RCBO':out.protection==='RCD'?'RCD':'MCB';
      const key  = `${prot}_${out.breaker}_${ph}`;
      if(!mcbMap[key]) mcbMap[key]={prot,breaker:out.breaker,ph,cnt:0};
      mcbMap[key].cnt++;
    });
    const lines = Object.values(mcbMap).map(g=>`${g.cnt}× ${g.prot} ${g.breaker}A ${g.ph}`);
    rcds.forEach(r=>{
      const ampPart = r.amp?`${r.amp}A/`:'';
      lines.push(`1× RCD ${ampPart}${r.mA}mA${r.poles?` ${r.poles}P`:''}`);
    });
    return lines.slice(0,5);
  };

  /* ── Layout-Konstanten ───────────────────────────────────────────────── */
  const HDR_H  = 28;  // Typ-Name Header
  const FEED_H = 17;  // Einspeisungs-Zeile (Pfeil + Label)
  const SEP_H  =  1;  // Trennlinie
  const SECT_H = 14;  // „Out:"-Abschnittstitel
  const OUT_H  = 20;  // Höhe je Outlet-Zeile
  const FOOT_PER= 11; // Höhe je Footer-Zeile (MCB/RCD)
  const INST_H = 14;  // Instanz-Name unten
  const NODE_W = 264; // Kasten-Breite
  const COL_W  = 326; // Spalten-Abstand
  const LEAF_W = 162;
  const LEAF_H = 38;
  const LEAF_GAP= 6;
  const PAD    = 46;
  const ROW_GAP = 20;

  // Dynamisches linkes Padding: genug Raum für die längste Hauptanschluss-Bezeichnung
  const mcMaxLabelPx = mainConns.reduce((mx, mc) => {
    const nW = (mc.name||'').length * 8;        // ~8px pro Zeichen, 10px bold
    const aW = mc.amp ? (String(mc.amp)+' A').length * 7 : 0;
    return Math.max(mx, nW, aW);
  }, 0);
  // bx = LEFT_PAD + 14, Label endet bei bx-22 = LEFT_PAD-8
  // Links muss mind. 6px Luft bleiben: LEFT_PAD - 8 - labelW >= 6 → LEFT_PAD >= labelW + 14
  const LEFT_PAD = Math.max(PAD, mcMaxLabelPx + 16);

  const nodeH = (inst) => {
    const type = boxTypeById[inst?.typeId];
    const nOut  = (type?.outlets||[]).length;
    const fLines= footerLines(inst).length;
    return HDR_H + FEED_H + SEP_H + SECT_H + Math.max(nOut,0)*OUT_H
         + (fLines>0 ? 6+fLines*FOOT_PER : 4) + INST_H + 6;
  };

  /* ── Outlet-Mappings ─────────────────────────────────────────────────── */
  const outletToChild = {};
  instances.forEach(inst=>{
    if(!inst.parentId) return;
    const parentType = boxTypeById[instById[inst.parentId]?.typeId];
    const parentOutlets = parentType?.outlets || [];
    // Schritt 1: exakte ID
    let oIdx = parentOutlets.findIndex(o=>o.id===inst.parentOutletId);
    // Schritt 2: Connector-Type-Fallback
    if(oIdx < 0) {
      const feedConn = boxTypeById[inst.typeId]?.feedConnector;
      if(feedConn) oIdx = parentOutlets.findIndex(o=>o.connector===feedConn);
    }
    oIdx = Math.max(0, oIdx);
    const resolvedOutlet = parentOutlets[oIdx];
    if(resolvedOutlet) outletToChild[`${inst.parentId}__${resolvedOutlet.id}`]=inst.id;
  });
  const outletToPlacs = {};
  (placements||[]).forEach(p=>{
    const k=`${p.instanceId}__${p.outletId}`;
    (outletToPlacs[k]=outletToPlacs[k]||[]).push(p);
  });

  /* ── Tree-Layout (Outlet-ausgerichtet) ───────────────────────────────── */
  const getChildren = (pid) => instances.filter(i=>i.parentId===pid);

  // Outlet-Index ermitteln: erst exakte ID, dann Connector-Type-Match, dann 0
  const resolveOutletIdx = (childInst, parentOutlets) => {
    let idx = parentOutlets.findIndex(o => o.id === childInst.parentOutletId);
    if(idx < 0) {
      const feedConn = boxTypeById[childInst.typeId]?.feedConnector;
      if(feedConn) idx = parentOutlets.findIndex(o => o.connector === feedConn);
    }
    return Math.max(0, idx);
  };

  // Y-Offset der ersten Outlet-Zeile innerhalb eines Kastens
  const outY_base = HDR_H + FEED_H + SEP_H + SECT_H; // 28+17+1+14 = 60

  // Subtree-Höhe: berücksichtigt Outlet-Positionen der Kinder
  const subtreeH = (id) => {
    const inst = instById[id]; if(!inst) return 60;
    const h = nodeH(inst);
    const ch = getChildren(id);
    if(ch.length === 0) return h;
    const type = boxTypeById[inst.typeId];
    const outlets = type?.outlets || [];
    // Kinder aufsteigend nach Outlet-Index sortieren (Erstellungsreihenfolge ignorieren)
    const sortedCh = ch.slice().sort((a,b)=>{
      const ia = resolveOutletIdx(a, outlets);
      const ib = resolveOutletIdx(b, outlets);
      return ia - ib;
    });
    let prevBottom = 0;
    sortedCh.forEach(child => {
      const oIdx = resolveOutletIdx(child, outlets);
      const outletRelY = outY_base + oIdx*OUT_H + OUT_H/2;
      const childFeedRelY = HDR_H + FEED_H/2;
      const idealChildTop = outletRelY - childFeedRelY;
      const actualChildTop = Math.max(idealChildTop, prevBottom);
      prevBottom = actualChildTop + subtreeH(child.id) + ROW_GAP;
    });
    return Math.max(h, prevBottom - ROW_GAP);
  };

  // Position-Zuweisung: Kinder werden am Outlet-Y des Eltern ausgerichtet
  const positions = {};
  const assignPos = (id, depth, nodeTopY) => {
    const inst = instById[id]; if(!inst) return;
    positions[id] = { x: depth*COL_W+LEFT_PAD, y: nodeTopY };
    const type = boxTypeById[inst.typeId];
    const outlets = type?.outlets || [];
    // Kinder aufsteigend nach Outlet-Index sortieren (Erstellungsreihenfolge ignorieren)
    const sortedCh = getChildren(id).slice().sort((a,b)=>{
      const ia = resolveOutletIdx(a, outlets);
      const ib = resolveOutletIdx(b, outlets);
      return ia - ib;
    });
    let prevBottom = nodeTopY;
    sortedCh.forEach(child => {
      const oIdx = resolveOutletIdx(child, outlets);
      const outletRelY = outY_base + oIdx*OUT_H + OUT_H/2;
      const childFeedRelY = HDR_H + FEED_H/2;
      const idealChildY = nodeTopY + outletRelY - childFeedRelY;
      const actualChildY = Math.max(idealChildY, prevBottom + ROW_GAP/2);
      assignPos(child.id, depth+1, actualChildY);
      prevBottom = actualChildY + subtreeH(child.id) + ROW_GAP/2;
    });
  };
  let rootY = PAD;
  rootInstances.forEach(r => {
    assignPos(r.id, 0, rootY);
    rootY += subtreeH(r.id) + ROW_GAP;
  });

  const outletAbsY = (instId, outletId) => {
    const pos=positions[instId]; if(!pos) return 0;
    const type=boxTypeById[instById[instId]?.typeId];
    const outlets=type?.outlets||[];
    const idx=outlets.findIndex(o=>o.id===outletId);
    if(idx<0) return pos.y + outY_base + OUT_H/2;  // gleicher Fallback wie assignPos (idx=0)
    return pos.y + outY_base + idx*OUT_H + OUT_H/2;
  };

  // Y-Position des Eltern-Outlets für eine Eltern-Kind-Kante (mit Connector-Type-Fallback)
  const childOutletAbsY = (parentInstId, childInst) => {
    const pos = positions[parentInstId]; if(!pos) return 0;
    const parentType = boxTypeById[instById[parentInstId]?.typeId];
    const outlets = parentType?.outlets || [];
    const idx = resolveOutletIdx(childInst, outlets);
    return pos.y + outY_base + idx*OUT_H + OUT_H/2;
  };

  /* ── SVG-Dimensionen ─────────────────────────────────────────────────── */
  const totalHeight = rootInstances.reduce((s,r)=>s+subtreeH(r.id)+ROW_GAP, 0);
  const maxDepth=instances.reduce((mx,inst)=>{ let d=0,cur=inst; while(cur.parentId){d++;cur=instById[cur.parentId]||{};if(d>20)break;} return Math.max(mx,d); },0);
  const leafInsts=instances.filter(i=>getChildren(i.id).length===0);
  const hasLeafConsumers=(placements||[]).length>0&&leafInsts.some(i=>{
    const t=boxTypeById[i.typeId];
    return (t?.outlets||[]).some(o=>(outletToPlacs[`${i.id}__${o.id}`]||[]).length>0);
  });
  // Kollisions-freie Stack-Positionen für alle Verbraucher vorberechnen
  // (greedy: Push-Down wenn Überschneidung mit Kind-Kasten oder bereits platziertem Stack)
  const consumerStackPositions = {}; // `instId__outId` → stackTop Y
  instances.forEach(inst => {
    const type = boxTypeById[inst.typeId];
    const outlets = type?.outlets || [];
    const pos = positions[inst.id]; if(!pos) return;
    const leafX = pos.x + NODE_W + Math.round((COL_W-NODE_W)/2);

    // Y-Bereiche ALLER Kästen ermitteln die sich mit der Consumer-Spalte überschneiden
    const blockedRanges = instances
      .filter(other => other.id !== inst.id)
      .flatMap(other => {
        const otherPos = positions[other.id]; if(!otherPos) return [];
        // X-Überschneidung: [leafX, leafX+LEAF_W] ∩ [otherPos.x, otherPos.x+NODE_W]
        if(leafX + LEAF_W <= otherPos.x || leafX >= otherPos.x + NODE_W) return [];
        return [{ top: otherPos.y, bottom: otherPos.y + nodeH(other) }];
      })
      .sort((a,b) => a.top - b.top);

    const claimedRanges = []; // bereits platzierte Consumer-Stacks dieser Instanz

    outlets.forEach(out => {
      const placs = outletToPlacs[`${inst.id}__${out.id}`] || [];
      if(!placs.length) return;
      const oY = outletAbsY(inst.id, out.id);
      const totalH = placs.length * (LEAF_H + LEAF_GAP) - LEAF_GAP;

      // Startposition: ideales Zentrum am Outlet; nach unten schieben bis kein Konflikt
      let stackTop = oY - LEAF_H/2;
      let changed = true;
      while(changed) {
        changed = false;
        for(const r of [...blockedRanges, ...claimedRanges].sort((a,b)=>a.top-b.top)) {
          if(stackTop + totalH > r.top && stackTop < r.bottom) {
            stackTop = r.bottom + 4;
            changed = true; break;
          }
        }
      }
      claimedRanges.push({ top: stackTop, bottom: stackTop + totalH });
      consumerStackPositions[`${inst.id}__${out.id}`] = stackTop;
    });
  });

  // SVG-Höhe: tiefste Consumer-Box aller Instanzen berücksichtigen
  const maxLeafBottom = instances.reduce((mx,inst)=>{
    const pos=positions[inst.id]; if(!pos) return mx;
    const type=boxTypeById[inst.typeId];
    return (type?.outlets||[]).reduce((m,out)=>{
      const placs=outletToPlacs[`${inst.id}__${out.id}`]||[];
      if(!placs.length) return m;
      const stackTop = consumerStackPositions[`${inst.id}__${out.id}`] ?? (outletAbsY(inst.id,out.id)-LEAF_H/2);
      const totalH=placs.length*(LEAF_H+LEAF_GAP)-LEAF_GAP;
      return Math.max(m, stackTop + totalH);
    }, mx);
  }, 0);
  const svgW=LEFT_PAD+(maxDepth)*COL_W+PAD+NODE_W+(hasLeafConsumers?COL_W/2+LEAF_W+PAD:0);
  const svgH=Math.max(totalHeight+PAD*2, maxLeafBottom+PAD, 260);

  /* ── Kanten ──────────────────────────────────────────────────────────── */
  const edges=instances
    .filter(i=>i.parentId&&positions[i.id]&&positions[i.parentId])
    .map(inst=>{
      const parentType=boxTypeById[instById[inst.parentId]?.typeId];
      const parentOutlets=parentType?.outlets||[];
      // staleCon=true wenn parentOutletId null/veraltet (Connector-Type-Fallback greift)
      const idxByExact=parentOutlets.findIndex(o=>o.id===inst.parentOutletId);
      const staleCon=idxByExact<0;
      const outlet=parentOutlets[resolveOutletIdx(inst, parentOutlets)];
      const y1=childOutletAbsY(inst.parentId, inst);
      const toPos=positions[inst.id];
      // y2 = Mitte der Einspeisungs-Zeile des Kind-Kastens
      const feedMidY = toPos.y + HDR_H + FEED_H/2;
      return { x1:positions[inst.parentId].x+NODE_W, y1,
               x2:toPos.x, y2:feedMidY,
               inst, outlet, adapted:isAdapted(inst.id), staleCon };
    });

  const mcCenterY=(mc)=>{
    const ri=rootInstances.filter(i=>i.mainConnectionId===mc.id);
    if(!ri.length) return null;
    const ys=ri.map(i=>positions[i.id]).filter(Boolean).map(p=>p.y);
    if(!ys.length) return null;
    return (Math.min(...ys)+Math.max(...ys)+nodeH(instById[ri[ri.length-1].id]))/2;
  };

  return (
    <Section title="Blockschaltbild" subtitle="Topologie · IEC 60309 · ausführliche Anschlussbezeichnungen">
      <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"78vh",background:"#1b2026",borderRadius:8,padding:12}}>
        <svg ref={svgRef} width={svgW} height={svgH} style={{display:"block",minWidth:svgW}}>

          {/* ── Hauptanschlüsse ─────────────────────────────────────────── */}
          {mainConns.map(mc=>{
            const cy=mcCenterY(mc); if(cy===null) return null;
            const connInsts=rootInstances.filter(i=>i.mainConnectionId===mc.id);
            const bx=LEFT_PAD+14;
            return (
              <g key={mc.id}>
                <line x1={bx} y1={cy-28} x2={bx} y2={cy+28} stroke="#f5a623" strokeWidth={4} strokeLinecap="round"/>
                <line x1={bx-20} y1={cy} x2={bx-1} y2={cy} stroke="#f5a623" strokeWidth={1.5}/>
                <polygon points={`${bx-5},${cy-4} ${bx+3},${cy} ${bx-5},${cy+4}`} fill="#f5a623"/>
                <text x={bx-22} y={cy-12} textAnchor="end" fill="#f5a623" fontSize={10} fontWeight="700">{mc.name}</text>
                {mc.amp&&<text x={bx-22} y={cy+22} textAnchor="end" fill="#f5a623" fontSize={9} opacity="0.75">{mc.amp} A</text>}
                {connInsts.map(ri=>{
                  const pos=positions[ri.id]; if(!pos) return null;
                  return <line key={ri.id} x1={bx} y1={cy} x2={pos.x} y2={pos.y+HDR_H+FEED_H/2}
                               stroke="#f5a623" strokeWidth={1.2} strokeDasharray="5,4" opacity={0.4}/>;
                })}
              </g>
            );
          })}

          {/* ── Verbindungslinien ────────────────────────────────────────── */}
          {edges.map((e,i)=>{
            const mx=(e.x1+e.x2)/2, my=(e.y1+e.y2)/2;
            const lbl=e.outlet?connShort(e.outlet.connector):"";
            // staleCon (kein gespeicherter Ausgang) → orange gestrichelt
            const edgeCol=e.staleCon?"#d97706":e.adapted?"#a78bfa":"#4a5568";
            const txtCol =e.staleCon?"#f5a623":e.adapted?"#c4a8fa":"#8ab8d8";
            const dashArr=e.staleCon?"4,2":e.adapted?"6,3":undefined;
            return (
              <g key={i}>
                <path d={orthoPath(e.x1,e.y1,e.x2,e.y2)}
                      fill="none" stroke={edgeCol} strokeWidth={1.6}
                      strokeDasharray={dashArr}/>
                {lbl&&(
                  <text x={mx} y={my-4} textAnchor="middle"
                        fill={txtCol} fontSize={8}
                        style={{paintOrder:"stroke",stroke:"#1b2026",strokeWidth:3}}>
                    {lbl}
                  </text>
                )}
                {e.staleCon&&(
                  <text x={mx} y={my+10} textAnchor="middle"
                        fill="#d97706" fontSize={9}
                        style={{paintOrder:"stroke",stroke:"#1b2026",strokeWidth:3}}>
                    ⚠
                  </text>
                )}
              </g>
            );
          })}

          {/* ── Kasten-Knoten ────────────────────────────────────────────── */}
          {instances.map(inst=>{
            const pos=positions[inst.id]; if(!pos) return null;
            const type=boxTypeById[inst.typeId];
            const outlets=type?.outlets||[];
            const feedConn=type?.feedConnector||"";
            const FeedSym=connSym(feedConn);
            const adapted=isAdapted(inst.id);
            const h=nodeH(inst);
            const fLines=footerLines(inst);

            // Typ-Name für Header (Kurzform wenn nötig)
            const typeName=type?.name||"–";
            const dispTypeName=typeName.length>24?typeName.slice(0,23)+"…":typeName;

            // Trennlinie Y (unterhalb FEED_H)
            const sepY=HDR_H+FEED_H;
            // Outlet-Bereich Beginn
            const outY=HDR_H+FEED_H+SEP_H+SECT_H;
            // Footer-Bereich Beginn
            const footY=outY+outlets.length*OUT_H;

            return (
              <g key={inst.id} transform={`translate(${pos.x},${pos.y})`}>

                {/* ── Rahmen ─────────────────────────────────────────────── */}
                <rect width={NODE_W} height={h} rx={5}
                      fill="#21282f" stroke="#3a424c" strokeWidth={1.5}/>

                {/* ── Header: Typ-Name ────────────────────────────────────── */}
                <rect width={NODE_W} height={HDR_H} rx={5} fill="#171c22"/>
                <rect y={HDR_H-5} width={NODE_W} height={5} fill="#171c22"/>
                <text x={9} y={19} fill="#cdd6df" fontSize={11} fontWeight="700">
                  {dispTypeName}
                </text>
                {adapted&&(
                  <circle cx={NODE_W-9} cy={HDR_H/2} r={4} fill="#a78bfa" opacity="0.9">
                    <title>Adapter: Stecker passt nicht zum Eltern-Anschluss</title>
                  </circle>
                )}

                {/* ── Socket-Symbol am linken Eingang (wenn Kind-Kasten) ─────── */}
                {inst.parentId&&(
                  <g transform={`translate(0,${HDR_H+FEED_H/2})`}>
                    {/* Buchsen-Gehäuse links, ragt leicht aus dem Rahmen heraus */}
                    <rect x={-10} y={-5} width={10} height={10} rx={1.5}
                          stroke="#4a7494" strokeWidth={1.1} fill="#21282f"/>
                    {/* Buchsen-Löcher */}
                    <circle cx={-7} cy={-1} r={1.4} stroke="#4a7494" strokeWidth={0.9} fill="none"/>
                    <circle cx={-3} cy={-1} r={1.4} stroke="#4a7494" strokeWidth={0.9} fill="none"/>
                    {/* Verbindungslinie Buchse → Innen */}
                    <line x1={0} y1={0} x2={FeedSym?22:7} y2={0}
                          stroke="#4a7494" strokeWidth={0.8} strokeDasharray="2,2"/>
                  </g>
                )}

                {/* ── Einspeisungs-Zeile ───────────────────────────────────── */}
                {FeedSym&&<FeedSym x={6} y={HDR_H+1} s={0.78} col="#3a5a74"/>}
                <text x={FeedSym?24:9} y={HDR_H+12} fill="#4a7494" fontSize={8.5}>
                  {"←"} {connMid(feedConn)}{type?.feedAmp?` · ${type.feedAmp} A`:""}
                </text>

                {/* ── Trennlinie ─────────────────────────────────────────── */}
                <line x1={8} y1={sepY} x2={NODE_W-8} y2={sepY}
                      stroke="#2e3848" strokeWidth={0.8}/>

                {/* ── „Out:" Abschnitt-Label ────────────────────────────── */}
                {outlets.length>0&&(
                  <text x={9} y={sepY+SECT_H-2} fill="#4a5a6a"
                        fontSize={7.5} fontWeight="700" fontStyle="italic">
                    Out:
                  </text>
                )}

                {/* ── Outlet-Zeilen ─────────────────────────────────────── */}
                {outlets.map((out,idx)=>{
                  const ry=outY+idx*OUT_H;
                  const hasChild=!!outletToChild[`${inst.id}__${out.id}`];
                  const hasPlac=(outletToPlacs[`${inst.id}__${out.id}`]||[]).length>0;
                  const active=hasChild||hasPlac;
                  const txtCol=active?"#7aaec8":"#344454";
                  const plugCol=active?"#4a7494":"transparent";

                  // Kombiniertes Label: Outlet-Name + Steckertyp
                  const outName=out.label||`Out ${idx+1}`;
                  const connDesc=connMid(out.connector);
                  // Kürze wenn nötig (Stecker-Symbol nimmt ~20px am rechten Rand)
                  const avail=Math.floor((NODE_W-24)/5.6); // ~5.6px/char bei font-size 9
                  const combined=`${outName}  ${connDesc}`;
                  const dispLabel=combined.length>avail ? combined.slice(0,avail-1)+"…" : combined;

                  return (
                    <g key={out.id} transform={`translate(0,${ry})`}>
                      {idx>0&&<line x1={8} y1={0} x2={NODE_W-8} y2={0}
                                    stroke="#252e3a" strokeWidth={0.5}/>}
                      <text x={9} y={14} fill={txtCol} fontSize={9}>{dispLabel}</text>
                      {/* Stecker-Ausgangs-Symbol wenn aktiv */}
                      {active&&(
                        <g>
                          {/* Linie → Steckergehäuse */}
                          <line x1={NODE_W-24} y1={OUT_H/2} x2={NODE_W-16} y2={OUT_H/2}
                                stroke={plugCol} strokeWidth={1}/>
                          {/* Gehäuse */}
                          <rect x={NODE_W-16} y={OUT_H/2-5} width={10} height={10} rx={1.5}
                                stroke={plugCol} strokeWidth={1.1} fill="none"/>
                          {/* Stifte */}
                          <line x1={NODE_W-13} y1={OUT_H/2-5} x2={NODE_W-13} y2={OUT_H/2-8}
                                stroke={plugCol} strokeWidth={1.2} strokeLinecap="round"/>
                          <line x1={NODE_W-9} y1={OUT_H/2-5} x2={NODE_W-9} y2={OUT_H/2-8}
                                stroke={plugCol} strokeWidth={1.2} strokeLinecap="round"/>
                          {/* Ausgangs-Linie zur Kante */}
                          <line x1={NODE_W-6} y1={OUT_H/2} x2={NODE_W} y2={OUT_H/2}
                                stroke={plugCol} strokeWidth={1}/>
                          <circle cx={NODE_W} cy={OUT_H/2} r={2.5} fill={plugCol}/>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* ── Footer: MCB / FI ──────────────────────────────────── */}
                {fLines.length>0&&(
                  <g transform={`translate(0,${footY})`}>
                    <line x1={8} y1={5} x2={NODE_W-8} y2={5}
                          stroke="#2a3a2a" strokeWidth={0.7}/>
                    {fLines.map((ln,li)=>(
                      <text key={li} x={9} y={15+li*FOOT_PER}
                            fill="#3a6a4a" fontSize={8}>{ln}</text>
                    ))}
                  </g>
                )}

                {/* ── Instanz-Name unten rechts ─────────────────────────── */}
                <text x={NODE_W-6} y={h-5} textAnchor="end"
                      fill="#3a4a5a" fontSize={8} fontStyle="italic">
                  {inst.name}
                </text>

              </g>
            );
          })}

          {/* ── Verbraucher-Boxen (alle Instanzen mit belegten Ausgängen) ─── */}
          {instances.flatMap(inst=>{
            const type=boxTypeById[inst.typeId];
            const outlets=type?.outlets||[];
            const pos=positions[inst.id]; if(!pos) return [];
            const leafX=pos.x+NODE_W+Math.round((COL_W-NODE_W)/2);
            return outlets.flatMap(out=>{
              const placs=outletToPlacs[`${inst.id}__${out.id}`]||[];
              if(!placs.length) return [];
              const oY=outletAbsY(inst.id, out.id);
              // Kollisions-freie Position (ggf. nach unten verschoben)
              const stackTop=consumerStackPositions[`${inst.id}__${out.id}`]??oY-LEAF_H/2;
              const isMC = isMulticore(out.connector);
              return placs.map((plac,pi)=>{
                const load=loadById?.[plac.loadId]; if(!load) return null;
                const leafY=stackTop+pi*(LEAF_H+LEAF_GAP);
                const midY=leafY+LEAF_H/2;
                const wattStr=load.watt?`${load.watt} W`:"";
                const ampStr=load.watt?` · ${round2(load.watt/230)} A`:"";
                // Bei MC: Name etwas kürzer lassen, damit das Slot-Badge Platz hat
                const maxName = isMC&&plac.mcSlot!=null ? 14 : 18;
                const nameDisp=load.name&&load.name.length>maxName?load.name.slice(0,maxName-1)+"…":(load.name||"?");
                return (
                  <g key={plac.id}>
                    <path d={orthoPath(pos.x+NODE_W,oY,leafX,midY)}
                          fill="none" stroke="#3a5060" strokeWidth={1.2}/>
                    <g transform={`translate(${leafX},${leafY})`}>
                      <rect width={LEAF_W} height={LEAF_H} rx={4}
                            fill="#1a2530" stroke="#3a5060" strokeWidth={1}/>
                      <text x={8} y={14} fill="#6aaabf" fontSize={9} fontWeight="600">{nameDisp}</text>
                      <text x={8} y={27} fill="#3a6070" fontSize={8}>{wattStr}{ampStr}</text>
                      {/* Multicore-Slot-Badge oben rechts */}
                      {isMC&&plac.mcSlot!=null&&(
                        <g>
                          <rect x={LEAF_W-30} y={4} width={26} height={13} rx={3}
                                fill="#1e3a4a" stroke="#3a7a9a" strokeWidth={0.8}/>
                          <text x={LEAF_W-17} y={14} textAnchor="middle"
                                fill="#b8ecff" fontSize={8} fontWeight="700">
                            Ch.{plac.mcSlot}
                          </text>
                        </g>
                      )}
                    </g>
                  </g>
                );
              }).filter(Boolean);
            });
          })}

        </svg>
      </div>
    </Section>
  );
}

function Section({title,subtitle,children}){ return <section style={S.section}><h2 style={S.h2}>{title}</h2>{subtitle&&<p style={S.subtitle}>{subtitle}</p>}{children}</section>; }
function Field({label,children}){ return <label style={S.field}><span style={S.fieldLabel}>{label}</span>{children}</label>; }

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Errichtungsprüfung
══════════════════════════════════════════════════════════════════════════ */
const SICHT_ITEMS = [
  "Schaltgeräte",
  "Steckverbinder",
  "Leitungen",
  "Gehäuse",
  "Kennzeichnung",
  "Basisschutz",
];

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Erweitert – Leitungsdimensionierung & Spannungsfall
══════════════════════════════════════════════════════════════════════════ */
function ErweitertTab({ cableCalcs, setCableCalcs, voltCalcs, setVoltCalcs, subTab }) {
  /* ── Leitungsdimensionierung ────────────────────────────────────────────── */
  const newCalc = () => ({id:uid(),label:"",I_B:"",I_n:"",cableA:"",fTemp:"",fAdern:"",fLagen:"",fArt:"",fN:""});
  const addCalc = () => setCableCalcs(s=>[...s, newCalc()]);
  const delCalc = (id) => setCableCalcs(s=>s.filter(c=>c.id!==id));
  const upd = (id,patch) => setCableCalcs(s=>s.map(c=>c.id===id?{...c,...patch}:c));

  /* ── Spannungsfall ──────────────────────────────────────────────────────── */
  const newVolt = () => ({id:uid(),label:"",I:"",l:"",cosPhi:"",cableA:"",threePhase:""});
  const addVolt = () => setVoltCalcs(s=>[...s, newVolt()]);
  const delVolt = (id) => setVoltCalcs(s=>s.filter(c=>c.id!==id));
  const updV = (id,patch) => setVoltCalcs(s=>s.map(c=>c.id===id?{...c,...patch}:c));

  return (
    <>
      {/* ── Leitungsdimensionierung ─────────────────────────────────────── */}
      <div style={{display:subTab==="dim"?"block":"none"}}>
        <Section title="Leitungsdimensionierung"
                 subtitle="H07RN-F · DIN VDE 0298-4 · Prüfkette Iʙ ≤ Iₙ ≤ Iₘ">
          <div style={{marginBottom:16}}>
            <button style={S.primaryBtn} onClick={addCalc}>+ Neue Rechnung</button>
          </div>
          {cableCalcs.length===0 && (
            <p style={{color:"#666",fontSize:13}}>Noch keine Rechnungen vorhanden. Über &bdquo;+ Neue Rechnung&ldquo; eine neue anlegen.</p>
          )}
          {cableCalcs.map(calc=>{
            const dim = calcDim(calc.cableA,calc.fTemp,calc.fAdern,calc.fLagen,calc.fArt,calc.fN);
            const ready = calc.I_B!==""&&calc.I_n!==""&&calc.cableA!=="";
            const chk1 = ready && +calc.I_B<=+calc.I_n;
            const chk2 = ready && dim!=null && +calc.I_n<=dim.izul;
            const allOk = chk1&&chk2;
            const resBg = !ready ? {} : allOk
              ? {background:"rgba(46,204,113,0.08)",border:"1px solid rgba(46,204,113,0.28)"}
              : {background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.28)"};
            return (
              <div key={calc.id} style={{...S.card,marginBottom:12}}>
                {/* Kopfzeile */}
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:"1px solid #3a424c"}}>
                  <input style={{...S.inputSm,flex:1}} placeholder="Bezeichnung (optional)"
                    value={calc.label} onChange={e=>upd(calc.id,{label:e.target.value})}/>
                  <button style={S.dangerBtn} onClick={()=>delCalc(calc.id)}>&#x2715;</button>
                </div>
                {/* Ströme & Querschnitt */}
                <div style={{padding:"10px 14px",borderBottom:"1px solid #3a424c"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Iʙ &ndash; Betriebsstrom
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input type="number" min="0" step="0.1" style={{...S.inputSm,width:80}}
                          value={calc.I_B} placeholder="&mdash;"
                          onChange={e=>upd(calc.id,{I_B:e.target.value})}/>
                        <span style={{fontSize:12,color:"#9aa4af"}}>A</span>
                      </div>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Iₙ &ndash; Nennstrom Sicherung
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input type="number" min="0" step="1" style={{...S.inputSm,width:80}}
                          value={calc.I_n} placeholder="&mdash;"
                          onChange={e=>upd(calc.id,{I_n:e.target.value})}/>
                        <span style={{fontSize:12,color:"#9aa4af"}}>A</span>
                      </div>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Querschnitt
                      <select style={{...S.selectSm,width:90}} value={calc.cableA}
                        onChange={e=>upd(calc.id,{cableA:e.target.value})}>
                        <option value="">&mdash;</option>
                        {CABLE_CS_H07.map(cs=><option key={cs} value={cs}>{cs} mm&sup2;</option>)}
                      </select>
                    </label>
                  </div>
                </div>
                {/* Korrekturfaktoren */}
                <div style={{padding:"10px 14px",borderBottom:"1px solid #3a424c"}}>
                  <div style={{fontSize:11,color:"#9aa4af",fontWeight:600,marginBottom:8,letterSpacing:".04em"}}>
                    KORREKTURFAKTOREN
                    <span style={{fontWeight:400,color:"#555",marginLeft:6,textTransform:"none"}}>(leer = Faktor entfällt)</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-end"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Umgebungstemperatur
                      <select style={{...S.selectSm,width:110}} value={calc.fTemp}
                        onChange={e=>upd(calc.id,{fTemp:e.target.value})}>
                        <option value="">&mdash;</option>
                        {Object.keys(F_TEMP).map(t=><option key={t} value={t}>{t} °C</option>)}
                      </select>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Stromf. Adern
                      <select style={{...S.selectSm,width:95}} value={calc.fAdern}
                        onChange={e=>upd(calc.id,{fAdern:e.target.value})}>
                        <option value="">&mdash;</option>
                        {Object.keys(F_ADERN).map(n=><option key={n} value={n}>{n} Adern</option>)}
                      </select>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Aufgewickelt
                      <select style={{...S.selectSm,width:105}} value={calc.fLagen}
                        onChange={e=>upd(calc.id,{fLagen:e.target.value})}>
                        <option value="">&mdash;</option>
                        {Object.keys(F_LAGEN).map(n=><option key={n} value={n}>{n==="1"?"1 Lage":n+" Lagen"}</option>)}
                      </select>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Häufung – Verlegeart
                      <select style={{...S.selectSm,width:115}} value={calc.fArt}
                        onChange={e=>upd(calc.id,{fArt:e.target.value,fN:""})}>
                        <option value="">&mdash;</option>
                        <option value="einl">Einlagig</option>
                        <option value="gebund">Gebündelt</option>
                      </select>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Häufung – Anz. Leitungen
                      <select style={{...S.selectSm,width:115}} value={calc.fN}
                        disabled={!calc.fArt}
                        onChange={e=>upd(calc.id,{fN:e.target.value})}>
                        <option value="">&mdash;</option>
                        {Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
                {/* Ergebnis */}
                {ready && dim && (
                  <div style={{...resBg,padding:"10px 14px",borderRadius:"0 0 8px 8px"}}>
                    <div style={{display:"flex",flexWrap:"wrap",gap:16,alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:12,color:"#9aa4af"}}>
                        Gesamtfaktor: <strong style={{color:"#e8eaed"}}>{dim.fTotal.toFixed(2)}</strong>
                      </span>
                      <span style={{fontSize:12,color:"#9aa4af"}}>
                        Iₘ Basis: <strong style={{color:"#e8eaed"}}>{dim.base} A</strong>
                      </span>
                      <span style={{fontSize:12,color:"#9aa4af"}}>
                        Iₘ korrigiert:{" "}
                        <strong style={{color:chk2?"#2ecc71":"#e74c3c",fontSize:14}}>{dim.izul} A</strong>
                      </span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      <div style={{fontSize:13,color:chk1?"#2ecc71":"#e74c3c",display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontWeight:700}}>{chk1?"✓":"✗"}</span>
                        <span>Iʙ ({calc.I_B} A) {chk1?"≤":">"} Iₙ ({calc.I_n} A)</span>
                        {!chk1&&<span style={{fontSize:11,marginLeft:4}}>&mdash; Betriebsstrom übersteigt Sicherung!</span>}
                      </div>
                      <div style={{fontSize:13,color:chk2?"#2ecc71":"#e74c3c",display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontWeight:700}}>{chk2?"✓":"✗"}</span>
                        <span>Iₙ ({calc.I_n} A) {chk2?"≤":">"} Iₘ ({dim.izul} A)</span>
                        {!chk2&&<span style={{fontSize:11,marginLeft:4}}>&mdash; Kabel zu klein!</span>}
                      </div>
                    </div>
                  </div>
                )}
                {ready && !dim && (
                  <div style={{padding:"10px 14px",color:"#666",fontSize:12}}>Kein Querschnitt gewählt oder nicht in Tabelle.</div>
                )}
              </div>
            );
          })}
        </Section>
      </div>

      {/* ── Spannungsfall ───────────────────────────────────────────────── */}
      <div style={{display:subTab==="volt"?"block":"none"}}>
        <Section title="Spannungsfall"
                 subtitle="H07RN-F · DIN VDE 0100-520 · ΔU ≤ 3 % empfohlen">
          <div style={{marginBottom:16}}>
            <button style={S.primaryBtn} onClick={addVolt}>+ Neue Rechnung</button>
          </div>
          {voltCalcs.length===0 && (
            <p style={{color:"#666",fontSize:13}}>Noch keine Rechnungen vorhanden. Über &bdquo;+ Neue Rechnung&ldquo; eine neue anlegen.</p>
          )}
          {voltCalcs.map(calc=>{
            const ready = calc.I!==""&&calc.l!==""&&calc.cosPhi!==""&&calc.cableA!==""&&calc.threePhase!=="";
            const du    = ready ? calcVoltDrop(+calc.I,+calc.l,+calc.cableA,+calc.cosPhi,calc.threePhase==="3ph") : null;
            const minA  = ready ? minCsVoltDrop(+calc.I,+calc.l,+calc.cosPhi,calc.threePhase==="3ph") : null;
            const duPct = du?.pct ?? null;
            const col   = duPct===null ? null : duPct<=3 ? "#2ecc71" : duPct<=5 ? "#f5a623" : "#e74c3c";
            const resBg = du===null ? {} : duPct<=3
              ? {background:"rgba(46,204,113,0.08)",border:"1px solid rgba(46,204,113,0.28)"}
              : duPct<=5
              ? {background:"rgba(245,166,35,0.10)",border:"1px solid rgba(245,166,35,0.35)"}
              : {background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.28)"};
            return (
              <div key={calc.id} style={{...S.card,marginBottom:12}}>
                {/* Kopfzeile */}
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:"1px solid #3a424c"}}>
                  <input style={{...S.inputSm,flex:1}} placeholder="Bezeichnung (optional)"
                    value={calc.label} onChange={e=>updV(calc.id,{label:e.target.value})}/>
                  <button style={S.dangerBtn} onClick={()=>delVolt(calc.id)}>&#x2715;</button>
                </div>
                {/* Eingaben */}
                <div style={{padding:"10px 14px",borderBottom:"1px solid #3a424c"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Strom I
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input type="number" min="0" step="0.1" style={{...S.inputSm,width:80}}
                          value={calc.I} placeholder="&mdash;"
                          onChange={e=>updV(calc.id,{I:e.target.value})}/>
                        <span style={{fontSize:12,color:"#9aa4af"}}>A</span>
                      </div>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Länge l
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input type="number" min="0" step="1" style={{...S.inputSm,width:80}}
                          value={calc.l} placeholder="&mdash;"
                          onChange={e=>updV(calc.id,{l:e.target.value})}/>
                        <span style={{fontSize:12,color:"#9aa4af"}}>m</span>
                      </div>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      cos φ
                      <input type="number" min="0" max="1" step="0.01" style={{...S.inputSm,width:70}}
                        value={calc.cosPhi} placeholder="&mdash;"
                        onChange={e=>updV(calc.id,{cosPhi:e.target.value})}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Querschnitt
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input type="number" min="0" step="0.5" style={{...S.inputSm,width:75}}
                          value={calc.cableA} placeholder="&mdash;"
                          onChange={e=>updV(calc.id,{cableA:e.target.value})}/>
                        <span style={{fontSize:12,color:"#9aa4af"}}>mm&sup2;</span>
                      </div>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11,color:"#9aa4af"}}>
                      Phasigkeit
                      <select style={{...S.selectSm,width:105}} value={calc.threePhase}
                        onChange={e=>updV(calc.id,{threePhase:e.target.value})}>
                        <option value="">&mdash;</option>
                        <option value="1ph">1-phasig</option>
                        <option value="3ph">3-phasig</option>
                      </select>
                    </label>
                  </div>
                </div>
                {/* Ergebnis */}
                {du && (
                  <div style={{...resBg,padding:"10px 14px",borderRadius:"0 0 8px 8px"}}>
                    <div style={{display:"flex",flexWrap:"wrap",gap:20,alignItems:"center",marginBottom:6}}>
                      <span style={{fontSize:13,color:"#9aa4af"}}>
                        ΔU = <strong style={{color:col,fontSize:16}}>{du.V.toFixed(2)} V</strong>
                      </span>
                      <span style={{fontSize:13,color:"#9aa4af"}}>
                        ΔU = <strong style={{color:col,fontSize:16}}>{du.pct.toFixed(2)} %</strong>
                      </span>
                    </div>
                    {minA!==null && (
                      <div style={{fontSize:12,color:"#9aa4af"}}>
                        Min. Querschnitt für ΔU ≤ 3 %:{" "}
                        <strong style={{color:"#e8eaed"}}>≥ {minA.toFixed(2)} mm²</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      </div>
    </>
  );
}

function InspectionTab({ instances, instById, boxTypeById, mainConns, mainConnById, meta, placements, loadById, inspMeta, setInspMeta, inspResults, setInspResults }) {
  const updMeta = (patch) => setInspMeta(s=>({...s,...patch}));

  const IR_DEF = { voltL1N:"",voltL2N:"",voltL3N:"",voltL1L2:"",voltL2L3:"",voltL1L3:"",voltNPE:"",voltL1PE:"",voltL2PE:"",voltL3PE:"",phaseRot:"",rPE:"",rIso:"",zs:"",ik:"",sicht:[null,null,null,null,null,null],bemerkung:"",bemerkungSchwere:"bad",outlets:{} };
  const getIR = (iid) => { const sv=inspResults[iid]||{}; return {...IR_DEF,...sv,sicht:sv.sicht?[...sv.sicht]:[...IR_DEF.sicht],outlets:sv.outlets||{}}; };
  const updIR = (iid,patch) => setInspResults(s=>({...s,[iid]:{...getIR(iid),...patch}}));

  const OR_DEF = { rcdT1:"",rcdIan:"",ok:false,zs:"",ik:"",zsL1:"",zsL2:"",zsL3:"",ikL1:"",ikL2:"",ikL3:"",notInUse:false,cableLen:"",cableA:"",cosPhi:"0.95" };
  const getOR = (iid,oid) => ({...OR_DEF,...((getIR(iid).outlets||{})[oid]||{})});
  const updOR = (iid,oid,patch) => {
    const ir=getIR(iid);
    setInspResults(s=>({...s,[iid]:{...ir,outlets:{...(ir.outlets||{}),[oid]:{...getOR(iid,oid),...patch}}}}));
  };
  const worstZs = (...vs) => { const v=vs.filter(x=>x!=="").map(Number); return v.length ? Math.max(...v).toFixed(2) : ""; };
  const worstIk = (...vs) => { const v=vs.filter(x=>x!=="").map(Number); return v.length ? Math.min(...v).toFixed(0) : ""; };

  const cycleSicht = (iid,idx) => {
    const ir=getIR(iid); const sicht=[...(ir.sicht||Array(6).fill(null))];
    sicht[idx]=sicht[idx]===true?null:true;   // toggle: ok ↔ nicht eingetragen
    updIR(iid,{sicht});
  };

  const chk = (val,min,max) => {
    if(val===""||val===undefined||val===null) return null;
    const n=parseFloat(val); if(isNaN(n)) return null;
    if(min!==undefined&&n<min) return false;
    if(max!==undefined&&n>max) return false;
    return true;
  };
  const ckAll = (vals,min,max) => { const vs=vals.filter(v=>v!==""); if(!vs.length) return null; return vs.every(v=>chk(v,min,max)===true)?true:vs.some(v=>chk(v,min,max)===false)?false:null; };
  const inpBorder = (ok) => ok===true?{borderColor:"#2ecc71"}:ok===false?{borderColor:"#e74c3c"}:{};
  const cellBg    = (ok) => ({...S.td,background:ok===true?"rgba(46,204,113,0.12)":ok===false?"rgba(231,76,60,0.12)":"transparent"});

  const exportInspectionPDF = () => {
    const pw=window.open("","_blank","width=920,height=800");
    if(!pw){alert("Popup-Blocker aktiv – bitte erlauben.");return;}

    const esc=(s)=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const pdfChk=(val,lo,hi)=>{if(val===""||val===undefined||val===null)return"";const n=parseFloat(val);if(isNaN(n))return"";if(lo!==undefined&&n<lo)return"bad";if(hi!==undefined&&n>hi)return"bad";return"ok";};
    const pdfChkAll=(vals,lo,hi)=>{const vs=vals.filter(v=>v!=="");if(!vs.length)return"";return vs.some(v=>pdfChk(v,lo,hi)==="bad")?"bad":"ok";};
    const badge=(r)=>r==="ok"?`<span class="ok">✓ ok</span>`:r==="bad"?`<span class="bad">✕ Mangel</span>`:`<span class="muted">–</span>`;
    const sichtBadge=(v)=>v===true?`<span class="ok">✓ ok</span>`:`<span class="muted">–</span>`;
    const fv=(...vals)=>vals.filter(v=>v!=="").map(v=>esc(v)+"&thinsp;V").join(" / ")||"–";

    const css=`:root{--ep-accent:#f5a623;--ep-dark:#1c2127;--ep-ink:#1c2127;--ep-ink2:#4a5159;--ep-ink3:#7a8290;--ep-rule:#c8ccd1;--ep-rule2:#e6e9ec;--ep-band:#f3f4f6;--ep-paper:#ffffff;--ep-ok:#1c7a3e;--ep-bad:#b91c1c;--ep-warn:#8a5500;--ep-badrow:#fcf2f2;--ep-warnrow:#fdf7e6;--ep-font:'Segoe UI',system-ui,-apple-system,sans-serif;--ep-pad-x:44px;--ep-row-pad:4px 10px;--ep-gap-y:10px}
html,body{margin:0;padding:0;background:#2a2724;font-family:var(--ep-font)}*{box-sizing:border-box}
.ep-stage{min-height:100vh;padding:28px 0 80px;display:flex;flex-direction:column;align-items:center;gap:18px}
.page{width:794px;height:1123px;background:var(--ep-paper);color:var(--ep-ink);font-size:9.5px;line-height:1.45;font-variant-numeric:tabular-nums;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,.05),0 18px 40px -22px rgba(0,0,0,.4)}
.page-body{flex:1;padding:10px var(--ep-pad-x) 0;display:flex;flex-direction:column;min-height:0}.spacer-auto{flex:1;min-height:8px}
.page-h,.page-f{display:flex;justify-content:space-between;align-items:center;padding:8px var(--ep-pad-x);font-size:8px;color:var(--ep-ink3);letter-spacing:.1em;text-transform:uppercase}
.page-h{border-bottom:1px solid var(--ep-rule)}.page-f{border-top:1px solid var(--ep-rule);padding-bottom:10px;padding-top:6px;letter-spacing:.08em}.page-h strong{color:var(--ep-ink)}
.page-title{margin:4px 0 6px}.page-title .kicker{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--ep-ink3)}.page-title h1{margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em;line-height:1.2}.page-title .muted{color:var(--ep-ink3);font-weight:400}.page-title .muted-h1{font-size:13px}.page-title .id-h1{color:var(--ep-warn)}.page-title-row{display:flex;justify-content:space-between;align-items:baseline}
.befund-label{font-size:11px;font-weight:600}.befund-label.ok{color:var(--ep-ok)}.befund-label.bad{color:var(--ep-bad)}.befund-label.warn{color:var(--ep-warn)}
.block{margin-top:var(--ep-gap-y)}.bar{display:flex;justify-content:space-between;align-items:center;background:var(--ep-dark);color:#fff;padding:5px 10px;font-size:11px;border-left:3px solid var(--ep-accent)}.bar strong{font-weight:600}.bar-sub{margin-left:8px;color:#a8b0bb;font-weight:400;font-size:9.5px}.bar-right{font-size:9.5px;color:#cdd3da}.block-body{border:1px solid var(--ep-rule);border-top:none}
.ok{color:var(--ep-ok);font-weight:600;white-space:nowrap}.bad{color:var(--ep-bad);font-weight:600;white-space:nowrap}.warn{color:var(--ep-warn);font-weight:600;white-space:nowrap}
.kv{display:grid}.kv-2{grid-template-columns:repeat(2,1fr)}.kv-3{grid-template-columns:repeat(3,1fr)}.kv-row{display:grid;grid-template-columns:110px 1fr;padding:var(--ep-row-pad);border-bottom:1px solid var(--ep-rule2);border-right:1px solid var(--ep-rule2)}.kv-row.kv-right{border-right:none}.kv-row.kv-last{border-bottom:none}.kv-row .k{color:var(--ep-ink3)}.kv-row .v{color:var(--ep-ink)}
.thead{display:grid;padding:4px 10px;background:var(--ep-band);border-bottom:1px solid var(--ep-rule2);font-size:8px;color:var(--ep-ink3);letter-spacing:.08em;text-transform:uppercase}.thead .r{text-align:right}
.trow{display:grid;padding:var(--ep-row-pad);border-bottom:1px solid var(--ep-rule2);align-items:center}.trow.row-last{border-bottom:none}.trow.row-bad{background:var(--ep-badrow)}.trow .r{text-align:right}.trow .muted{color:var(--ep-ink3)}.trow .no{margin-right:8px}
.id{color:var(--ep-warn);font-weight:600}.muted{color:var(--ep-ink3)}.ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dual{display:grid;grid-template-columns:1fr 1fr}.sicht-cell{display:grid;grid-template-columns:36px 1fr 60px;padding:var(--ep-row-pad);align-items:center}.sicht-cell .r{text-align:right}.sicht-cell.row-bad{background:var(--ep-badrow)}.sicht-cell.row-warn{background:var(--ep-warnrow)}.sicht-cell.cell-bright{border-right:1px solid var(--ep-rule2)}.sicht-cell:not(.cell-blast){border-bottom:1px solid var(--ep-rule2)}.abg-cell{display:grid;grid-template-columns:70px 1fr;padding:var(--ep-row-pad);align-items:center}.abg-cell.cell-bright{border-right:1px solid var(--ep-rule2)}.abg-cell:not(.cell-blast){border-bottom:1px solid var(--ep-rule2)}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr)}.kpi{padding:8px 12px}.kpi.kpi-sep{border-right:1px solid var(--ep-rule2)}.kpi-k{font-size:8px;color:var(--ep-ink3);letter-spacing:.08em;text-transform:uppercase}.kpi-v{font-size:16px;font-weight:700;margin-top:2px}.kpi-s{font-size:9px}
.num-row{display:grid;grid-template-columns:30px 1fr;padding:var(--ep-row-pad);border-bottom:1px solid var(--ep-rule2)}.num-row.row-last{border-bottom:none}
.confirm{padding:8px 12px;color:var(--ep-ink2);line-height:1.55}.confirm strong{color:var(--ep-ink)}.bemerkung{padding:var(--ep-row-pad);background:var(--ep-warnrow)}.bemerkung.small{background:transparent;font-size:9px;color:var(--ep-ink2);line-height:1.5;padding:6px 10px}
.sign-row{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--ep-rule2)}.sign{padding:8px 12px}.sign.sign-r{border-left:1px solid var(--ep-rule2)}.sign-role{font-size:8px;color:var(--ep-ink3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:28px}.sign-line{border-bottom:1px solid var(--ep-ink);height:24px}.sign-name{margin-top:4px;font-weight:600}.sign .muted{font-size:9px}
@media print{html,body,.ep-stage{background:#fff;padding:0;gap:0}.page{box-shadow:none;page-break-after:always}.page:last-child{page-break-after:auto}}@page{size:A4 portrait;margin:0}`;

    // Topologische Sortierung: Einspeisepunkt → Kinder → Enkel (BFS, alphabetisch je Ebene)
    const sorted2=(() => {
      const result=[]; const visited=new Set();
      const visit=(parentId)=>{
        alphaSort(instances.filter(i=>i.parentId===parentId),"name").forEach(inst=>{
          if(!visited.has(inst.id)){ visited.add(inst.id); result.push(inst); visit(inst.id); }
        });
      };
      alphaSort(instances.filter(i=>!i.parentId),"name").forEach(inst=>{
        if(!visited.has(inst.id)){ visited.add(inst.id); result.push(inst); visit(inst.id); }
      });
      return result;
    })();
    const total=sorted2.length;
    const hdr=`<strong>Stromplaner</strong> · Errichtungsprüfung · DIN VDE 0100-600`;
    const subR=`${esc(meta?.production||"Planung")} · v${esc(meta?.version||"1")} · ${esc(inspMeta.date||"")}`;
    const ftrL=esc(inspMeta.inspector||"–");
    const ftrC=`EP-${(meta?.production||"Plan").replace(/[^A-Za-z0-9]/g,"-").slice(0,30)}-v${meta?.version||1}`;

    // Collect Mängel
    const maengel=[];
    sorted2.forEach(inst=>{
      const ir=getIR(inst.id);
      if(ir.bemerkung) maengel.push({inst,item:ir.bemerkung,type:ir.bemerkungSchwere||"bad"});
    });

    // Stats
    let totalPunkte=0,totalMangel=0,totalRCD=0;
    sorted2.forEach(inst=>{
      const ir=getIR(inst.id);
      const type=boxTypeById[inst.typeId];
      const outlets=type?sortOutlets(type.outlets):[];
      totalPunkte+=(ir.sicht||[]).filter(v=>v!==null).length;
      if(ir.bemerkung) totalMangel++;
      (type?.rcds||[]).forEach(rcd=>{if(getOR(inst.id,`rcd_${rcd.id}`).rcdT1!=="")totalRCD++;});
      outlets.filter(o=>o.protection==="RCBO").forEach(o=>{if(isMulticore(o.connector)){const sl=o.mcSlots||6;for(let s=1;s<=sl;s++){if(getOR(inst.id,`${o.id}_s${s}`).rcdT1!=="")totalRCD++;}}else{if(getOR(inst.id,o.id).rcdT1!=="")totalRCD++;}});
    });

    // ── Deckblatt ──────────────────────────────────────────────────────────
    let pages=`<article class="page">
  <header class="page-h"><span>${hdr}</span><span>${subR}</span></header>
  <main class="page-body">
    <div class="page-title"><div class="kicker">Errichtungsprüfung · DIN VDE 0100-600 · mobile Stromverteilung</div>
      <h1>${esc(meta?.production||"Planung")}<span class="muted"> · ${esc(inspMeta.address||inspMeta.location||"")}</span></h1></div>
    <section class="block"><header class="bar"><span><strong>Produktion</strong></span><span class="bar-right">v${esc(meta?.version||"1")} · ${esc(inspMeta.date||"")}</span></header>
      <div class="block-body"><div class="kv kv-2">
        <div class="kv-row"><span class="k">Produktion</span><span class="v">${esc(meta?.production||"–")}</span></div>
        <div class="kv-row kv-right"><span class="k">Ersteller</span><span class="v">${esc(meta?.creator||"–")}</span></div>
        <div class="kv-row kv-last"><span class="k">Adresse</span><span class="v">${esc(inspMeta.address||"–")}</span></div>
        <div class="kv-row kv-last kv-right"><span class="k">Ort des Anschlusses</span><span class="v">${esc(inspMeta.location||"–")}</span></div>
      </div></div></section>
    <section class="block"><header class="bar"><span><strong>Prüfung</strong><span class="bar-sub">DIN VDE 0100-600</span></span></header>
      <div class="block-body"><div class="kv kv-2">
        <div class="kv-row"><span class="k">Prüfer</span><span class="v">${esc(inspMeta.inspector||"–")}</span></div>
        <div class="kv-row kv-right"><span class="k">Netzform</span><span class="v">${esc(inspMeta.netType||"–")}</span></div>
        <div class="kv-row kv-last"><span class="k">Datum / Uhrzeit</span><span class="v">${esc(inspMeta.date||"–")}${inspMeta.time?" · "+esc(inspMeta.time):""}</span></div>
        <div class="kv-row kv-last kv-right"><span class="k">Norm</span><span class="v">DIN VDE 0100-600</span></div>
      </div></div></section>
    ${inspMeta.equipment?`<section class="block"><header class="bar"><span><strong>Prüfmittel</strong></span></header>
      <div class="block-body"><div class="num-row row-last"><span class="muted">01</span><span>${esc(inspMeta.equipment)}</span></div></div></section>`:""}
    <section class="block"><header class="bar"><span><strong>Umfang</strong><span class="bar-sub">${total} Kasten${total!==1?"":"en"}</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:1.6fr 1fr 1.1fr 1.1fr"><span>Bezeichnung</span><span>Typ</span><span>Eingang</span><span>Hängt an</span></div>
        ${sorted2.map((inst,i)=>{const type=boxTypeById[inst.typeId];const parent=inst.parentId?instById[inst.parentId]:null;const feedLbl=parent?esc(parent.name):inst.mainConnectionId?esc(mainConnById[inst.mainConnectionId]?.name||"–"):"— Einspeisung —";return`<div class="trow${i===sorted2.length-1?" row-last":""}" style="grid-template-columns:1.6fr 1fr 1.1fr 1.1fr"><span><strong>${esc(inst.name)}</strong></span><span class="muted">${esc(type?.name||"–")}</span><span class="muted">${CONN[type?.feedConnector]?.label||""} ${type?.feedAmp||""}A</span><span class="muted">${feedLbl}</span></div>`;}).join("")}
      </div></section>
    <div class="spacer-auto"></div>
  </main>
  <footer class="page-f"><span>${ftrL}</span><span>${ftrC}</span><span>Seite 01 / ${total+2}</span></footer>
</article>`;

    // ── Pro Kasten ────────────────────────────────────────────────────────
    sorted2.forEach((inst,instIdx)=>{
      const type=boxTypeById[inst.typeId];
      const outlets=type?sortOutlets(type.outlets):[];
      const ir=getIR(inst.id);
      const sicht=ir.sicht||Array(6).fill(null);
      // #16: RCD-Gruppen + RCBO im PDF
      const pdfRcdRows=[];
      (type?.rcds||[]).forEach(rcd=>pdfRcdRows.push({rowType:"rcd",rcd,outlet:null,oid:`rcd_${rcd.id}`,rowLabel:rcd.label,iAnLimit:rcd.mA,protLabel:`RCD ${rcd.mA} mA`}));
      outlets.filter(o=>o.protection==="RCBO").forEach(o=>{
        if(isMulticore(o.connector)){const slots=o.mcSlots||6;for(let s=1;s<=slots;s++)pdfRcdRows.push({rowType:"rcbo",rcd:null,outlet:o,oid:`${o.id}_s${s}`,rowLabel:`${o.label} – SP ${s} (${PHASES[(s-1)%3]})`,iAnLimit:null,protLabel:`RCBO ${o.breaker} ${o.amp}A`});}
        else pdfRcdRows.push({rowType:"rcbo",rcd:null,outlet:o,oid:o.id,rowLabel:o.label,iAnLimit:null,protLabel:`RCBO ${o.breaker} ${o.amp}A`});
      });
      const parent=inst.parentId?instById[inst.parentId]:null;
      const n=instIdx+1;
      const pageNum=String(n+1).padStart(2,"0");
      const totalPages=total+2;
      const hasMangel=!!(ir.bemerkung&&(ir.bemerkungSchwere||"bad")==="bad");
      const hasHinweis=!!(ir.bemerkung&&ir.bemerkungSchwere==="warn");
      const befundCls=hasMangel?"bad":hasHinweis?"warn":"ok";
      const befundLbl=hasMangel?"✕ Mangel":hasHinweis?"! Hinweis":"✓ Bestanden";

      const phaseR=ir.phaseRot==="rechts"?"ok":ir.phaseRot==="links"?"bad":"";
      const ckVLN=pdfChkAll([ir.voltL1N,ir.voltL2N,ir.voltL3N],207,244);
      const ckVLL=pdfChkAll([ir.voltL1L2,ir.voltL2L3,ir.voltL1L3],360,424);
      const ckVNPE=pdfChk(ir.voltNPE,undefined,1);
      const ckVLPE=pdfChkAll([ir.voltL1PE,ir.voltL2PE,ir.voltL3PE],207,244);

      let secIdx=4; // starts after Stammdaten(1), Sicht(2), Mess(3)
      const rcdSec=pdfRcdRows.length?secIdx++:0;
      const abgSec=secIdx++;
      const cableRows=outlets.filter(o=>getOR(inst.id,o.id).cableLen!=="");
      const cableSec=cableRows.length?secIdx++:0;
      const bemSec=ir.bemerkung?secIdx:0;

      pages+=`<article class="page">
  <header class="page-h"><span>${hdr}</span><span>${subR}</span></header>
  <main class="page-body">
    <div class="page-title"><div class="page-title-row">
      <div><div class="kicker">Kasten ${n} von ${total} · ${esc(type?.name||"")}</div>
        <h1><span class="id-h1">${esc(inst.name)}</span><span class="muted muted-h1"> · ${CONN[type?.feedConnector]?.label||""} ${type?.feedAmp||""}A · ${esc(type?.name||"")}</span></h1></div>
      <span class="befund-label ${befundCls}">${befundLbl}</span>
    </div></div>
    <section class="block"><header class="bar"><span><strong>${n}.1 · Stammdaten</strong></span></header>
      <div class="block-body"><div class="kv kv-3">
        <div class="kv-row"><span class="k">Typ</span><span class="v">${esc(type?.name||"–")}</span></div>
        <div class="kv-row"><span class="k">Eingang</span><span class="v">${CONN[type?.feedConnector]?.label||""} ${type?.feedAmp||""}A</span></div>
        <div class="kv-row kv-right"><span class="k">Netzform</span><span class="v">${esc(inspMeta.netType||"–")}</span></div>
        <div class="kv-row kv-last"><span class="k">Hängt an</span><span class="v">${parent?esc(parent.name):inst.mainConnectionId?esc(mainConnById[inst.mainConnectionId]?.name||"–"):"— Einspeisung —"}</span></div>
        <div class="kv-row kv-last" style="grid-column:span 2"><span class="k">Anschlüsse</span><span class="v">${outlets.length} Stk.</span></div>
      </div></div></section>
    <section class="block"><header class="bar"><span><strong>${n}.2 · Sichtprüfung</strong><span class="bar-sub">6 Punkte</span></span></header>
      <div class="block-body"><div class="dual">
        ${SICHT_ITEMS.map((item,idx)=>`<div class="sicht-cell${sicht[idx]===false?" row-bad":""}${idx%2===0?" cell-bright":""}${idx>=4?" cell-blast":""}"><span class="muted">${n}.2.${idx+1}</span><span class="ell">${esc(item)}</span><span class="r">${sichtBadge(sicht[idx])}</span></div>`).join("")}
      </div></div></section>
    <section class="block"><header class="bar"><span><strong>${n}.3 · Messungen</strong><span class="bar-sub">Drehfeld · U</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:1fr 210px 130px 80px"><span>Prüfung</span><span class="r">Wert</span><span class="r">Grenzwert</span><span class="r">Befund</span></div>
        <div class="trow" style="grid-template-columns:1fr 210px 130px 80px"><span><span class="muted no">${n}.3.1</span>Drehfeldrichtung</span><span class="r"><strong>${ir.phaseRot==="rechts"?"rechts":ir.phaseRot==="links"?"links":"–"}</strong></span><span class="r muted">rechts</span><span class="r">${badge(phaseR)}</span></div>
        <div class="trow" style="grid-template-columns:1fr 210px 130px 80px"><span><span class="muted no">${n}.3.2</span>U L–N (L1 / L2 / L3)</span><span class="r"><strong>${fv(ir.voltL1N,ir.voltL2N,ir.voltL3N)}</strong></span><span class="r muted">207–244 V</span><span class="r">${badge(ckVLN)}</span></div>
        <div class="trow" style="grid-template-columns:1fr 210px 130px 80px"><span><span class="muted no">${n}.3.3</span>U L–L (L1-L2 / L2-L3 / L1-L3)</span><span class="r"><strong>${fv(ir.voltL1L2,ir.voltL2L3,ir.voltL1L3)}</strong></span><span class="r muted">360–424 V</span><span class="r">${badge(ckVLL)}</span></div>
        <div class="trow" style="grid-template-columns:1fr 210px 130px 80px"><span><span class="muted no">${n}.3.4</span>U N–PE</span><span class="r"><strong>${ir.voltNPE?esc(ir.voltNPE)+"&thinsp;V":"–"}</strong></span><span class="r muted">Spannungsfrei</span><span class="r">${badge(ckVNPE)}</span></div>
        <div class="trow row-last" style="grid-template-columns:1fr 210px 130px 80px"><span><span class="muted no">${n}.3.5</span>U L–PE (L1 / L2 / L3)</span><span class="r"><strong>${fv(ir.voltL1PE,ir.voltL2PE,ir.voltL3PE)}</strong></span><span class="r muted">207–244 V</span><span class="r">${badge(ckVLPE)}</span></div>
      </div></section>
    ${pdfRcdRows.length?`<section class="block"><header class="bar"><span><strong>${n}.${rcdSec} · RCD-Prüfung</strong><span class="bar-sub">${pdfRcdRows.length} Stk.</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:1fr 80px 100px 90px 60px"><span>Anschluss / RCD</span><span>Typ</span><span class="r">I_An (mA)<br><span style="font-weight:400;font-size:8px">&le; Nennwert</span></span><span class="r">t_A (ms)<br><span style="font-weight:400;font-size:8px">&le; 300 ms</span></span><span class="r">OK</span></div>
        ${pdfRcdRows.map(({rowType,rcd,outlet,oid,rowLabel,iAnLimit,protLabel},i)=>{const or=getOR(inst.id,oid);const okT=pdfChk(or.rcdT1,undefined,300);const okIan=iAnLimit?pdfChk(or.rcdIan,undefined,iAnLimit):"";const bgStyle=rowType==="rcd"?"background:rgba(245,166,35,0.04);":"";return`<div class="trow${i===pdfRcdRows.length-1?" row-last":""}" style="${bgStyle}grid-template-columns:1fr 80px 100px 90px 60px"><span><span class="id">${esc(rowLabel)}</span></span><span class="muted">${esc(protLabel)}</span><span class="r${okIan==="bad"?" bad":""}"><strong>${esc(or.rcdIan)||"–"}</strong>${iAnLimit?`<br><span class="muted" style="font-size:8px">&le; ${iAnLimit}&thinsp;mA</span>`:""}</span><span class="r${okT==="bad"?" bad":""}"><strong>${esc(or.rcdT1)||"–"}</strong></span><span class="r">${or.ok?`<span class="ok">✓ ok</span>`:`<span class="muted">–</span>`}</span></div>`;}).join("")}
      </div></section>`:""}
    ${(()=>{
      // MC-Slots expandieren wie in der UI
      const abgRows=[];
      outlets.forEach(o=>{
        if(isMulticore(o.connector)){
          const slots=o.mcSlots||6;
          for(let s=1;s<=slots;s++){
            const oid=`${o.id}_s${s}`;
            const pl=(placements||[]).filter(p=>p.instanceId===inst.id&&p.outletId===o.id&&p.mcSlot===s);
            const lbl=pl.length?(loadById||{})[pl[0].loadId]?.name||"–":"–";
            abgRows.push({oid,label:`${o.label} SP${s}`,lbl,amp:o.amp||16,is3p:false,hasChild:false});
          }
        } else {
          const childInsts=instances.filter(ci=>ci.parentId===inst.id&&ci.parentOutletId===o.id);
          const pl=(placements||[]).filter(p=>p.instanceId===inst.id&&p.outletId===o.id);
          const lbl=childInsts.length?childInsts[0].name:(pl.length?(loadById||{})[pl[0].loadId]?.name||"–":"–");
          abgRows.push({oid:o.id,label:o.label,lbl,amp:o.amp||type?.feedAmp||16,is3p:is3ph(o.connector),hasChild:childInsts.length>0});
        }
      });
      const pdfWorstZs=(...vs)=>{const v=vs.filter(x=>x!=="").map(Number);return v.length?Math.max(...v).toFixed(2):"";};
      const pdfWorstIk=(...vs)=>{const v=vs.filter(x=>x!=="").map(Number);return v.length?Math.min(...v).toFixed(0):"";};
      return `<section class="block"><header class="bar"><span><strong>${n}.${abgSec} · Abgänge &amp; Schleifenimpedanz</strong><span class="bar-sub">${abgRows.length} Stk.</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:80px 1fr 90px 100px 55px"><span>Anschl.</span><span>Verbraucher / Kasten</span><span class="r">Z_s (Ω)</span><span class="r">I_k (A)<br><span style="font-weight:400;font-size:8px">≥ In×10 A</span></span><span class="r">Befund</span></div>
        ${abgRows.map(({oid,label,lbl,amp,is3p,hasChild},i)=>{
          const or=getOR(inst.id,oid);
          const ikLimO=amp*10;
          const zsLimO=parseFloat((230/(amp*10)).toFixed(2));
          const last=i===abgRows.length-1?" row-last":"";
          if(or.notInUse) return `<div class="trow${last}" style="grid-template-columns:80px 1fr 90px 100px 55px;opacity:0.55"><span class="id">${esc(label)}</span><span class="ell muted" style="font-style:italic">Nicht in Betrieb</span><span class="r muted">–</span><span class="r muted">–</span><span class="r muted">—</span></div>`;
          if(hasChild) return `<div class="trow${last}" style="grid-template-columns:80px 1fr 90px 100px 55px"><span class="id">${esc(label)}</span><span class="ell muted" style="font-style:italic">Messung wird an angeschlossenen Steckpl&#228;tzen durchgef&#252;hrt und entf&#228;llt an dieser Stelle.</span><span class="r muted">–</span><span class="r muted">–</span><span class="r muted">—</span></div>`;
          const zsVal=is3p?pdfWorstZs(or.zsL1,or.zsL2,or.zsL3):(or.zs||"");
          const ikVal=is3p?pdfWorstIk(or.ikL1,or.ikL2,or.ikL3):(or.ik||"");
          const zsNote=is3p&&zsVal?` <span style="font-size:8px;color:#888">(${[or.zsL1,or.zsL2,or.zsL3].filter(x=>x).join("/")})</span>`:"";
          const ikNote=is3p&&ikVal?` <span style="font-size:8px;color:#888">(${[or.ikL1,or.ikL2,or.ikL3].filter(x=>x).join("/")})</span>`:"";
          const ckZsO=pdfChk(zsVal,undefined,zsLimO);
          const ckIkO=pdfChk(ikVal,ikLimO,undefined);
          const ckO=ckIkO==="bad"||ckZsO==="bad"?"bad":ckIkO==="ok"||ckZsO==="ok"?"ok":"";
          return `<div class="trow${last}" style="grid-template-columns:80px 1fr 90px 100px 55px"><span class="id">${esc(label)}</span><span class="ell">${esc(lbl)}</span><span class="r">${zsVal?esc(zsVal)+" Ω"+zsNote:"–"}</span><span class="r"><strong>${ikVal?esc(ikVal)+" A"+ikNote:"–"}</strong><br><span class="muted" style="font-size:8px">≥ ${ikLimO} A</span></span><span class="r">${badge(ckO)}</span></div>`;
        }).join("")}
      </div></section>`;
    })()}
    ${cableRows.length?`<section class="block"><header class="bar"><span><strong>${n}.${cableSec} · Leitungen &amp; Spannungsfall</strong><span class="bar-sub">${cableRows.length} Stk.</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:1fr 55px 65px 65px 65px 65px 55px"><span>Abgang</span><span class="r">I_N</span><span class="r">&ell; (m)</span><span class="r">A (mm&sup2;)</span><span class="r">&Delta;U (V)</span><span class="r">&Delta;U (%)</span><span class="r">Befund</span></div>
        ${cableRows.map((o,i)=>{const or=getOR(inst.id,o.id);const du=calcVoltDrop(o.amp,or.cableLen,or.cableA,or.cosPhi,is3ph(o.connector));const befund=du?(du.pct<=3?"ok":du.pct<=5?"warn":"bad"):"";return`<div class="trow${i===cableRows.length-1?" row-last":""}" style="grid-template-columns:1fr 55px 65px 65px 65px 65px 55px"><span class="id">${esc(o.label)}</span><span class="r muted">${o.amp}A</span><span class="r">${esc(or.cableLen)||"–"}&thinsp;m</span><span class="r">${esc(or.cableA)||"–"}&thinsp;mm&sup2;</span><span class="r">${du?du.V.toFixed(2)+"&thinsp;V":"–"}</span><span class="r${du&&du.pct>5?" bad":du&&du.pct>3?" warn":""}"><strong>${du?du.pct.toFixed(2)+"&thinsp;%":"–"}</strong></span><span class="r">${badge(befund)}</span></div>`;}).join("")}
      </div></section>`:""}
    ${ir.bemerkung?`<section class="block"><header class="bar"><span><strong>${n}.${bemSec} · Bemerkung</strong></span><span class="bar-right">${(ir.bemerkungSchwere||"bad")==="warn"?`<span class="warn">! Hinweis</span>`:`<span class="bad">✕ Mangel</span>`}</span></header>
      <div class="block-body"><div class="bemerkung${(ir.bemerkungSchwere||"bad")==="warn"?"":" row-bad"}">${esc(ir.bemerkung)}</div></div></section>`:""}
  </main>
  <footer class="page-f"><span>${ftrL}</span><span>${ftrC}</span><span>Seite ${pageNum} / ${totalPages}</span></footer>
</article>`;
    });

    // ── Abschluss ────────────────────────────────────────────────────────
    const lastNum=String(total+2).padStart(2,"0");
    pages+=`<article class="page">
  <header class="page-h"><span>${hdr}</span><span>${subR}</span></header>
  <main class="page-body">
    <div class="page-title"><div class="kicker">Abschluss · Mängelliste · Bestätigung</div><h1>Befund &amp; Unterschrift</h1></div>
    <section class="block"><header class="bar"><span><strong>E · Mängel und Auflagen</strong><span class="bar-sub">${maengel.length} Eintr${maengel.length===1?"ag":"äge"}</span></span></header>
      <div class="block-body">${maengel.length===0?`<div style="padding:6px 10px;color:#7a8290;font-size:9.5px">Keine Mängel protokolliert.</div>`:`
        <div class="thead" style="grid-template-columns:40px 200px 1fr 80px"><span>Nr.</span><span>Kasten</span><span>Beschreibung</span><span class="r">Schwere</span></div>
        ${maengel.map((m,i)=>`<div class="trow${i===maengel.length-1?" row-last":""}" style="grid-template-columns:40px 200px 1fr 80px"><span class="muted">M${String(i+1).padStart(2,"0")}</span><span>${esc(m.inst.name)}</span><span>${esc(m.item)}</span><span class="r">${m.type==="bad"?`<span class="bad">✕ Mangel</span>`:`<span class="warn">! Hinweis</span>`}</span></div>`).join("")}`}
      </div></section>
    <section class="block"><header class="bar"><span><strong>F · Unterschrift</strong><span class="bar-sub">Prüfende Elektrofachkraft</span></span></header>
      <div class="block-body">
        <div class="sign" style="padding:12px 12px 8px"><div class="sign-role">Prüfende Elektrofachkraft · DIN VDE 0100-600</div><div class="sign-line"></div><div class="sign-name">${esc(inspMeta.inspector||"–")}</div><div class="muted">${esc(inspMeta.location||"")}${inspMeta.date?" · "+esc(inspMeta.date):""}</div></div>
      </div></section>
    <div class="spacer-auto"></div>
    <section class="block"><header class="bar"><span><strong>Hinweis</strong></span></header>
      <div class="block-body"><div class="bemerkung small">Dieses Protokoll ist im Zuge der Veranstaltung mitzuführen und bei der prüfenden Elektrofachkraft zu archivieren. Bei Erweiterung oder Umbau der Anlage ist eine erneute Prüfung der betroffenen Anlagenteile gemäß DIN VDE 0100-600 erforderlich.</div></div></section>
  </main>
  <footer class="page-f"><span>${ftrL}</span><span>${ftrC}</span><span>Seite ${lastNum} / ${lastNum}</span></footer>
</article>`;

    pw.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Errichtungsprüfung · ${esc(meta?.production||"")} · ${esc(inspMeta.date||"")}</title><style>${css}</style></head><body><div class="ep-stage">${pages}</div></body></html>`);
    pw.document.close();
    setTimeout(()=>{pw.focus();pw.print();},600);
  };

  // Topologische Sortierung: Einspeisepunkt → Kinder → Enkel (BFS, alphabetisch je Ebene)
  const sorted = (()=>{
    const result=[]; const visited=new Set();
    const visit=(parentId)=>{
      alphaSort(instances.filter(i=>i.parentId===parentId),"name").forEach(inst=>{
        if(!visited.has(inst.id)){ visited.add(inst.id); result.push(inst); visit(inst.id); }
      });
    };
    alphaSort(instances.filter(i=>!i.parentId),"name").forEach(inst=>{
      if(!visited.has(inst.id)){ visited.add(inst.id); result.push(inst); visit(inst.id); }
    });
    return result;
  })();

  // #9: Enter → nächstes Feld
  const inspRef = useRef(null);
  const handleEnterNav = (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName.toLowerCase() !== 'input') return;
    e.preventDefault();
    if (!inspRef.current) return;
    const all = [...inspRef.current.querySelectorAll('input:not([disabled])')];
    const idx = all.indexOf(e.target);
    if (idx >= 0 && idx < all.length - 1) { all[idx+1].focus(); all[idx+1].select?.(); }
  };

  return (
    <div ref={inspRef} onKeyDown={handleEnterNav}>
      <Section title="Prüfungsdetails">
        <div style={S.metaGrid}>
          <Field label="Prüfer"><input style={S.input} value={inspMeta.inspector} onChange={e=>updMeta({inspector:e.target.value})}/></Field>
          <Field label="Datum"><input style={S.input} type="date" value={inspMeta.date} onChange={e=>updMeta({date:e.target.value})}/></Field>
          <Field label="Uhrzeit"><input style={S.input} type="time" value={inspMeta.time||""} onChange={e=>updMeta({time:e.target.value})}/></Field>
          <Field label="Prüfmittel / Messgerät"><input style={S.input} value={inspMeta.equipment} onChange={e=>updMeta({equipment:e.target.value})}/></Field>
          <Field label="Adresse"><input style={S.input} value={inspMeta.address||""} onChange={e=>updMeta({address:e.target.value})}/></Field>
          <Field label="Ort des Anschlusses"><input style={S.input} value={inspMeta.location||""} onChange={e=>updMeta({location:e.target.value})}/></Field>
          <Field label="Netzform">
            <select style={S.input} value={inspMeta.netType||""} onChange={e=>updMeta({netType:e.target.value})}>
              <option value="">— nicht angegeben —</option>
              <option value="TN-S">TN-S</option>
              <option value="TN-C-S">TN-C-S</option>
              <option value="TT">TT</option>
              <option value="IT">IT</option>
            </select>
          </Field>
        </div>
        <div style={{textAlign:"right",marginTop:14}}>
          <button style={S.exportBtn} onClick={exportInspectionPDF}>🖨 Prüfprotokoll PDF</button>
        </div>
      </Section>

      {sorted.length===0
        ? <p style={S.empty}>Keine Kästen aktiviert. Bitte zuerst im Tab „Konfiguration" Kästen hinzufügen.</p>
        : sorted.map(inst=>{
          const type      = boxTypeById[inst.typeId];
          const outlets   = type ? sortOutlets(type.outlets) : [];
          const ir        = getIR(inst.id);
          const sicht     = ir.sicht || Array(6).fill(null);
          // #16: RCD-Gruppen als eigene Zeilen, danach RCBO-Anschlüsse (Multicore expandiert)
          const rcdGroups = type?.rcds || [];
          const rcboOutlets = outlets.filter(o=>o.protection==="RCBO");
          const expandedRcdRows = [];
          rcdGroups.forEach(rcd=>{
            expandedRcdRows.push({rowType:"rcd",rcd,outlet:null,oid:`rcd_${rcd.id}`,rowLabel:rcd.label,iAnLimit:rcd.mA,protLabel:`RCD ${rcd.mA} mA`});
          });
          rcboOutlets.forEach(o=>{
            if(isMulticore(o.connector)){
              const slots=o.mcSlots||6;
              for(let s=1;s<=slots;s++) expandedRcdRows.push({rowType:"rcbo",rcd:null,outlet:o,oid:`${o.id}_s${s}`,rowLabel:`${o.label} – SP ${s} (${PHASES[(s-1)%3]})`,iAnLimit:null,protLabel:`RCBO ${o.breaker} ${o.amp}A`});
            } else {
              expandedRcdRows.push({rowType:"rcbo",rcd:null,outlet:o,oid:o.id,rowLabel:o.label,iAnLimit:null,protLabel:`RCBO ${o.breaker} ${o.amp}A`});
            }
          });

          const okV1=chk(ir.voltL1N,207,244), okV2=chk(ir.voltL2N,207,244), okV3=chk(ir.voltL3N,207,244);
          const okL12=chk(ir.voltL1L2,360,424), okL23=chk(ir.voltL2L3,360,424), okL13=chk(ir.voltL1L3,360,424);
          const okNPE=chk(ir.voltNPE,undefined,1), okL1PE=chk(ir.voltL1PE,207,244), okL2PE=chk(ir.voltL2PE,207,244), okL3PE=chk(ir.voltL3PE,207,244);

          return (
            <Section key={inst.id}
              title={`🔌 ${inst.name}`}
              subtitle={`${type?.name||"?"} · Einspeisung: ${CONN[type?.feedConnector]?.label||""} ${type?.feedAmp||""}A`}>

              {/* ── Sichtprüfung ── */}
              <div style={{marginBottom:14}}>
                <p style={{fontSize:11,color:"#9aa4af",margin:"0 0 6px",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Sichtprüfung</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
                  {SICHT_ITEMS.map((item,idx)=>{
                    const v=sicht[idx];
                    return (
                      <div key={idx} onClick={()=>cycleSicht(inst.id,idx)} title={v===true?"OK – klicken zum Zurücksetzen":"Nicht eingetragen – klicken für OK"} style={{display:"flex",alignItems:"center",gap:7,background:v===true?"rgba(26,92,46,0.35)":"#1b2026",borderRadius:5,padding:"5px 8px",border:`1px solid ${v===true?"#2ecc71":LINE}`,cursor:"pointer",userSelect:"none",transition:"background .1s"}}>
                        <div style={{width:22,height:22,borderRadius:4,border:`2px solid ${v===true?"#2ecc71":"#3a424c"}`,fontWeight:700,fontSize:12,flexShrink:0,background:v===true?"#1a5c2e":"transparent",color:v===true?"#2ecc71":"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {v===true?"✓":""}
                        </div>
                        <span style={{fontSize:11,color:v===true?"#2ecc71":"#e8eaed"}}>{item}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Spannungsmessung + Drehfeld ── */}
              <div style={{...S.metaGrid,gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",marginBottom:6}}>
                <Field label="U L1–N (V)"><input style={{...S.inputSm,...inpBorder(okV1)}} value={ir.voltL1N||""} onChange={e=>updIR(inst.id,{voltL1N:e.target.value})}/><span style={S.normHint}>207–244 V</span></Field>
                <Field label="U L2–N (V)"><input style={{...S.inputSm,...inpBorder(okV2)}} value={ir.voltL2N||""} onChange={e=>updIR(inst.id,{voltL2N:e.target.value})}/><span style={S.normHint}>207–244 V</span></Field>
                <Field label="U L3–N (V)"><input style={{...S.inputSm,...inpBorder(okV3)}} value={ir.voltL3N||""} onChange={e=>updIR(inst.id,{voltL3N:e.target.value})}/><span style={S.normHint}>207–244 V</span></Field>
                <Field label="U L1–L2 (V)"><input style={{...S.inputSm,...inpBorder(okL12)}} value={ir.voltL1L2||""} onChange={e=>updIR(inst.id,{voltL1L2:e.target.value})}/><span style={S.normHint}>360–424 V</span></Field>
                <Field label="U L2–L3 (V)"><input style={{...S.inputSm,...inpBorder(okL23)}} value={ir.voltL2L3||""} onChange={e=>updIR(inst.id,{voltL2L3:e.target.value})}/><span style={S.normHint}>360–424 V</span></Field>
                <Field label="U L1–L3 (V)"><input style={{...S.inputSm,...inpBorder(okL13)}} value={ir.voltL1L3||""} onChange={e=>updIR(inst.id,{voltL1L3:e.target.value})}/><span style={S.normHint}>360–424 V</span></Field>
                <Field label="U N–PE (V)"><input style={{...S.inputSm,...inpBorder(okNPE)}} value={ir.voltNPE||""} onChange={e=>updIR(inst.id,{voltNPE:e.target.value})}/><span style={S.normHint}>Spannungsfrei</span></Field>
                <Field label="U L1–PE (V)"><input style={{...S.inputSm,...inpBorder(okL1PE)}} value={ir.voltL1PE||""} onChange={e=>updIR(inst.id,{voltL1PE:e.target.value})}/><span style={S.normHint}>207–244 V</span></Field>
                <Field label="U L2–PE (V)"><input style={{...S.inputSm,...inpBorder(okL2PE)}} value={ir.voltL2PE||""} onChange={e=>updIR(inst.id,{voltL2PE:e.target.value})}/><span style={S.normHint}>207–244 V</span></Field>
                <Field label="U L3–PE (V)"><input style={{...S.inputSm,...inpBorder(okL3PE)}} value={ir.voltL3PE||""} onChange={e=>updIR(inst.id,{voltL3PE:e.target.value})}/><span style={S.normHint}>207–244 V</span></Field>
                <Field label="Drehfeld">
                  <select style={{...S.inputSm,width:"100%"}} value={ir.phaseRot||""} onChange={e=>updIR(inst.id,{phaseRot:e.target.value})}>
                    <option value="">— nicht geprüft —</option>
                    <option value="rechts">Rechtsdrehfeld</option>
                    <option value="links">Linksdrehfeld</option>
                  </select>
                </Field>
              </div>

              {/* ── RCD-Prüfung ── */}
              {expandedRcdRows.length>0&&(
                <div style={{overflowX:"auto",marginBottom:14}}>
                  <p style={{fontSize:11,color:"#9aa4af",margin:"0 0 6px",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>RCD-Prüfung</p>
                  <table style={{...S.table,width:"100%"}}>
                    <thead><tr>
                      <th style={S.th}>Anschluss / RCD</th>
                      <th style={S.th}>Schutz</th>
                      <th style={S.th}>I_An (mA)<br/><span style={S.normHint}>≤ Nennwert</span></th>
                      <th style={S.th}>t_A (ms)<br/><span style={S.normHint}>≤ 300 ms</span></th>
                      <th style={S.th}>OK?</th>
                    </tr></thead>
                    <tbody>
                      {expandedRcdRows.map(({rowType,rcd,outlet,oid,rowLabel,iAnLimit,protLabel})=>{
                        const or=getOR(inst.id,oid);
                        const okT=chk(or.rcdT1,undefined,300);
                        const okIan=iAnLimit?chk(or.rcdIan,undefined,iAnLimit):null;
                        return (
                          <tr key={oid} style={rowType==="rcd"?{background:"rgba(245,166,35,0.06)"}:{}}>
                            <td style={S.td}><span style={rowType==="rcd"?{color:"#f5a623",fontWeight:600}:{}}>{rowLabel}</span></td>
                            <td style={{...S.td,fontSize:11,color:"#9aa4af"}}>{protLabel}</td>
                            <td style={cellBg(okIan)}>
                              <input type="number" step="1" placeholder="–" style={{...S.inputSm,width:80,...inpBorder(okIan)}} value={or.rcdIan||""} onChange={e=>updOR(inst.id,oid,{rcdIan:e.target.value})}/>
                              {iAnLimit&&<span style={S.normHint}>&le; {iAnLimit}&thinsp;mA</span>}
                            </td>
                            <td style={cellBg(okT)}><input type="number" step="1" placeholder="–" style={{...S.inputSm,width:80,...inpBorder(okT)}} value={or.rcdT1||""} onChange={e=>updOR(inst.id,oid,{rcdT1:e.target.value})}/></td>
                            <td style={{...S.td,textAlign:"center"}}>
                              <button onClick={()=>updOR(inst.id,oid,{ok:!or.ok})} title={or.ok?"OK – klicken zum Zurücksetzen":"Nicht OK – klicken für OK"} style={{width:22,height:22,borderRadius:4,border:`2px solid ${or.ok?"#2ecc71":"#3a424c"}`,cursor:"pointer",fontWeight:700,fontSize:12,background:or.ok?"#1a5c2e":"transparent",color:or.ok?"#2ecc71":"#555",display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}>
                                {or.ok?"✓":""}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Schleifenimpedanz (pro Abgang) – MC-Slots expandiert ── */}
              {outlets.length>0&&(()=>{
                const schleifenRows=[];
                outlets.forEach(outlet=>{
                  if(isMulticore(outlet.connector)){
                    const slots=outlet.mcSlots||6;
                    for(let s=1;s<=slots;s++)
                      schleifenRows.push({oid:`${outlet.id}_s${s}`,label:`${outlet.label} – SP ${s}`,subLabel:`${PHASES[(s-1)%3]} · ${outlet.amp}A`,amp:outlet.amp||16,is3p:false,hasChild:false,childName:""});
                  } else {
                    const childInsts=instances.filter(ci=>ci.parentId===inst.id&&ci.parentOutletId===outlet.id);
                    schleifenRows.push({oid:outlet.id,label:outlet.label,subLabel:`${CONN[outlet.connector]?.label||""} ${outlet.amp}A`,amp:outlet.amp||type?.feedAmp||16,is3p:is3ph(outlet.connector),hasChild:childInsts.length>0,childName:childInsts[0]?.name||""});
                  }
                });
                return (
                  <div style={{marginBottom:14}}>
                    <p style={{fontSize:11,color:"#9aa4af",margin:"0 0 6px",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Schleifenimpedanz &amp; Kurzschluss</p>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:4}}>
                      {schleifenRows.map(({oid,label,subLabel,amp,is3p,hasChild,childName})=>{
                        const or=getOR(inst.id,oid);
                        const zsLim=parseFloat((230/(amp*10)).toFixed(2));
                        const ikLim=amp*10;

                        if(hasChild) return (
                          <div key={oid} style={{background:"rgba(245,166,35,0.05)",border:`1px solid rgba(245,166,35,0.25)`,borderRadius:5,padding:"6px 8px"}}>
                            <div style={{fontSize:11,color:"#9aa4af",fontWeight:600,marginBottom:4}}>{label}<span style={{fontWeight:400,marginLeft:5,color:"#555"}}>{subLabel}</span></div>
                            <div style={{fontSize:11,color:"#f5a623"}}>↳ Unterverteiler: <strong>{childName}</strong></div>
                            <div style={{fontSize:10,color:"#555",marginTop:2}}>Messung wird an angeschlossenen Steckplätzen durchgeführt und entfällt an dieser Stelle.</div>
                          </div>
                        );

                        if(or.notInUse) return (
                          <div key={oid} style={{background:"rgba(80,80,80,0.06)",border:`1px dashed #3a424c`,borderRadius:5,padding:"6px 8px"}}>
                            <div style={{fontSize:11,color:"#9aa4af",fontWeight:600,marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span>{label}<span style={{fontWeight:400,marginLeft:5,color:"#555"}}>{subLabel}</span></span>
                              <button onClick={()=>updOR(inst.id,oid,{notInUse:false})} style={{...S.ghostBtn,fontSize:10,padding:"2px 6px",marginLeft:6}}>↩ Reaktivieren</button>
                            </div>
                            <div style={{fontSize:11,color:"#555",fontStyle:"italic"}}>Nicht in Betrieb / nicht gemessen</div>
                          </div>
                        );

                        if(is3p){
                          const eZs=worstZs(or.zsL1,or.zsL2,or.zsL3);
                          const eIk=worstIk(or.ikL1,or.ikL2,or.ikL3);
                          const okZs=eZs!==""?chk(eZs,undefined,zsLim):null;
                          const okIk=eIk!==""?chk(eIk,ikLim,undefined):null;
                          const anyBad=okZs===false||okIk===false;
                          const anyOk=okZs===true||okIk===true;
                          return (
                            <div key={oid} style={{background:anyBad?"rgba(231,76,60,0.08)":anyOk?"rgba(46,204,113,0.06)":"#1b2026",border:`1px solid ${anyBad?"#e74c3c":anyOk?"#2ecc71":LINE}`,borderRadius:5,padding:"6px 8px"}}>
                              <div style={{fontSize:11,color:"#9aa4af",fontWeight:600,marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}<span style={{fontWeight:400,marginLeft:5,color:"#666"}}>{subLabel}</span></span>
                                <button onClick={()=>updOR(inst.id,oid,{notInUse:true})} title="Als 'Nicht in Betrieb' markieren" style={{...S.ghostBtn,fontSize:10,padding:"2px 6px",marginLeft:6,flexShrink:0}}>Nicht in Betrieb</button>
                              </div>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                                <div>
                                  <div style={{fontSize:10,color:"#7c8794",marginBottom:3}}>Z_s (Ω) <span style={{color:"#555"}}>≤ {zsLim.toFixed(2).replace(".",",")} Ω</span></div>
                                  {["L1","L2","L3"].map(ph=>{
                                    const key=`zs${ph}`; const v=or[key]||"";
                                    const ok=v!==""?chk(v,undefined,zsLim):null;
                                    return <div key={ph} style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                                      <span style={{fontSize:10,color:"#666",width:18}}>{ph}</span>
                                      <input type="number" step="0.01" placeholder="–" style={{...S.inputSm,width:72,...inpBorder(ok)}} value={v} onChange={e=>updOR(inst.id,oid,{[key]:e.target.value})}/>
                                    </div>;
                                  })}
                                </div>
                                <div>
                                  <div style={{fontSize:10,color:"#7c8794",marginBottom:3}}>I_k (A) <span style={{color:"#555"}}>≥ {ikLim} A</span></div>
                                  {["L1","L2","L3"].map(ph=>{
                                    const key=`ik${ph}`; const v=or[key]||"";
                                    const ok=v!==""?chk(v,ikLim,undefined):null;
                                    return <div key={ph} style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                                      <span style={{fontSize:10,color:"#666",width:18}}>{ph}</span>
                                      <input type="number" step="1" placeholder="–" style={{...S.inputSm,width:72,...inpBorder(ok)}} value={v} onChange={e=>updOR(inst.id,oid,{[key]:e.target.value})}/>
                                    </div>;
                                  })}
                                </div>
                              </div>
                              {(eZs||eIk)&&<div style={{fontSize:10,color:"#666",marginTop:5,borderTop:`1px solid ${LINE}`,paddingTop:4}}>
                                Schlechtester Wert:&nbsp;
                                <span style={{color:okZs===false?"#e74c3c":okZs===true?"#2ecc71":"#9aa4af"}}>{eZs||"–"} Ω</span>
                                &nbsp;/&nbsp;
                                <span style={{color:okIk===false?"#e74c3c":okIk===true?"#2ecc71":"#9aa4af"}}>{eIk||"–"} A</span>
                              </div>}
                            </div>
                          );
                        }

                        // Einphasig
                        const okZs=chk(or.zs,undefined,zsLim);
                        const okIk=chk(or.ik,ikLim,undefined);
                        const anyBad=okZs===false||okIk===false;
                        const anyOk=okZs===true||okIk===true;
                        return (
                          <div key={oid} style={{background:anyBad?"rgba(231,76,60,0.08)":anyOk?"rgba(46,204,113,0.06)":"#1b2026",border:`1px solid ${anyBad?"#e74c3c":anyOk?"#2ecc71":LINE}`,borderRadius:5,padding:"6px 8px"}}>
                            <div style={{fontSize:11,color:"#9aa4af",fontWeight:600,marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}<span style={{fontWeight:400,marginLeft:5,color:"#666"}}>{subLabel}</span></span>
                              <button onClick={()=>updOR(inst.id,oid,{notInUse:true})} title="Als 'Nicht in Betrieb' markieren" style={{...S.ghostBtn,fontSize:10,padding:"2px 6px",marginLeft:6,flexShrink:0}}>Nicht in Betrieb</button>
                            </div>
                            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                              <div>
                                <div style={{fontSize:10,color:"#7c8794",marginBottom:2}}>Z_s (Ω)</div>
                                <input type="number" step="0.01" placeholder="–" style={{...S.inputSm,width:80,...inpBorder(okZs)}} value={or.zs||""} onChange={e=>updOR(inst.id,oid,{zs:e.target.value})}/>
                                <span style={S.normHint}>≤ {zsLim.toFixed(2).replace(".",",")} Ω</span>
                              </div>
                              <div>
                                <div style={{fontSize:10,color:"#7c8794",marginBottom:2}}>I_k (A)</div>
                                <input type="number" step="1" placeholder="–" style={{...S.inputSm,width:80,...inpBorder(okIk)}} value={or.ik||""} onChange={e=>updOR(inst.id,oid,{ik:e.target.value})}/>
                                <span style={S.normHint}>≥ {ikLim} A</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── Bemerkung / Auflage ── */}
              <div style={{marginTop:8}}>
                <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
                  <div style={{flex:"1 1 300px"}}>
                    <Field label="Bemerkung / Auflage">
                      <textarea style={{...S.input,width:"100%",minHeight:54,resize:"vertical"}} value={ir.bemerkung||""} onChange={e=>updIR(inst.id,{bemerkung:e.target.value})} placeholder="Freiwillig: Hinweis oder Mangel eintragen…"/>
                    </Field>
                  </div>
                  <div style={{width:130,paddingBottom:2}}>
                    <Field label="Schweregrad">
                      <select style={S.input} value={ir.bemerkungSchwere||"bad"} onChange={e=>updIR(inst.id,{bemerkungSchwere:e.target.value})} disabled={!ir.bemerkung}>
                        <option value="bad">✕ Mangel</option>
                        <option value="warn">! Hinweis</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            </Section>
          );
        })
      }
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────── */
const ACCENT="#f5a623", DARK="#1c2127", PANEL="#252b33", LINE="#3a424c";
const S={
  app:              {fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#15191e",minHeight:"100vh",color:"#e8eaed"},
  header:           {display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:DARK,borderBottom:`2px solid ${ACCENT}`,position:"sticky",top:0,zIndex:10,flexWrap:"wrap"},
  logo:             {fontWeight:800,fontSize:18,letterSpacing:1,color:ACCENT},
  headerMeta:       {fontSize:12,color:"#9aa4af",flex:1},
  exportBtn:        {background:ACCENT,color:"#1c2127",border:"none",borderRadius:6,padding:"8px 14px",fontWeight:700,cursor:"pointer",fontSize:13},
  ghostBtn:         {background:"transparent",color:"#e8eaed",border:`1px solid ${LINE}`,borderRadius:6,padding:"7px 11px",fontWeight:600,cursor:"pointer",fontSize:12,display:"inline-flex",alignItems:"center",gap:4},
  nav:              {display:"flex",gap:4,padding:"0 18px",background:DARK,borderBottom:`1px solid ${LINE}`,flexWrap:"wrap",position:"sticky",top:48,zIndex:9},
  navBtn:           {background:"transparent",border:"none",color:"#9aa4af",padding:"11px 13px",cursor:"pointer",fontSize:13,borderBottom:"3px solid transparent"},
  navBtnActive:     {color:"#fff",borderBottom:`3px solid ${ACCENT}`,fontWeight:600},
  main:             {padding:20,maxWidth:1200,margin:"0 auto"},
  section:          {background:PANEL,borderRadius:10,padding:20,marginBottom:20,border:`1px solid ${LINE}`},
  h2:               {margin:"0 0 4px",fontSize:17,color:"#fff"},
  subtitle:         {margin:"0 0 14px",fontSize:12,color:"#9aa4af",lineHeight:1.5},
  metaGrid:         {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:8},
  field:            {display:"flex",flexDirection:"column",gap:4},
  fieldLabel:       {fontSize:11,color:"#9aa4af",fontWeight:600},
  input:            {background:"#1b2026",border:`1px solid ${LINE}`,borderRadius:6,padding:"8px 10px",color:"#fff",fontSize:14},
  inputSm:          {background:"#1b2026",border:`1px solid ${LINE}`,borderRadius:5,padding:"5px 8px",color:"#fff",fontSize:13,width:"100%",boxSizing:"border-box"},
  select:           {background:"#1b2026",border:`1px solid ${LINE}`,borderRadius:6,padding:"8px 10px",color:"#fff",fontSize:14,minWidth:200},
  selectSm:         {background:"#1b2026",border:`1px solid ${LINE}`,borderRadius:5,padding:"5px 8px",color:"#fff",fontSize:13,width:"100%",boxSizing:"border-box"},
  row:              {display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:16},
  primaryBtn:       {background:ACCENT,color:"#1c2127",border:"none",borderRadius:6,padding:"9px 14px",fontWeight:700,cursor:"pointer",fontSize:13},
  secondaryBtn:     {background:"#323a44",color:"#fff",border:`1px solid ${LINE}`,borderRadius:6,padding:"8px 12px",cursor:"pointer",fontSize:12,marginTop:10},
  dangerBtn:        {background:"transparent",color:"#e74c3c",border:"1px solid #5a2a2a",borderRadius:5,padding:"4px 9px",cursor:"pointer",fontWeight:700},
  dangerBtnWide:    {background:"transparent",color:"#e74c3c",border:"1px solid #5a2a2a",borderRadius:6,padding:"8px 12px",cursor:"pointer",fontWeight:600,alignSelf:"flex-end"},
  table:            {width:"100%",borderCollapse:"collapse",marginTop:12,fontSize:13},
  th:               {textAlign:"left",padding:"7px 8px",borderBottom:`2px solid ${LINE}`,color:"#9aa4af",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.3},
  td:               {padding:"5px 8px",borderBottom:`1px solid ${LINE}`,verticalAlign:"middle"},
  empty:            {color:"#7c8794",fontStyle:"italic",padding:"16px 0"},
  hint:             {fontSize:11,color:"#7c8794",marginTop:10,lineHeight:1.5},
  card:             {border:`1px solid ${LINE}`,borderRadius:8,marginBottom:8,overflow:"visible",background:"#1f242b"},
  cardHead:         {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",cursor:"pointer"},
  cardTitle:        {fontWeight:600,fontSize:14},
  cardSub:          {fontSize:11,color:"#9aa4af"},
  cardBody:         {padding:14,borderTop:`1px solid ${LINE}`},
  boxTabs:          {display:"flex",gap:5,flexWrap:"wrap",marginBottom:14},
  boxTab:           {background:PANEL,border:`1px solid ${LINE}`,color:"#9aa4af",borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center"},
  boxTabActive:     {background:ACCENT,color:"#1c2127",fontWeight:700,border:`1px solid ${ACCENT}`},
  phaseBar:         {display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:0},
  phaseBox:         {background:"#1b2026",borderRadius:8,padding:12,border:`1px solid ${LINE}`},
  phaseLabel:       {fontSize:12,color:"#9aa4af",fontWeight:700},
  phaseVal:         {fontSize:20,fontWeight:800,margin:"3px 0"},
  phaseTrack:       {height:7,background:"#0e1216",borderRadius:4,overflow:"hidden"},
  phaseFill:        {height:"100%",borderRadius:4,transition:"width .3s"},
  phasePct:         {fontSize:10,color:"#7c8794",marginTop:4},
  rootCard:         {background:"#1f242b",borderRadius:8,padding:14,marginBottom:10,border:`1px solid ${ACCENT}`},
  rootTitle:        {fontSize:15,fontWeight:700},
  rootSub:          {fontSize:12,color:"#9aa4af",fontWeight:400},
  stickyPhase:      {position:"sticky",top:85,zIndex:5,background:PANEL,paddingBottom:8,marginBottom:4},
  normHint:         {fontSize:10,color:"#7c8794",marginTop:2,display:"block"},
  dropdown:         {position:"fixed",background:"#1b2026",border:`1px solid ${LINE}`,borderRadius:6,padding:6,zIndex:9999,boxShadow:"0 8px 32px rgba(0,0,0,.7)"},
  dropdownList:     {maxHeight:320,overflowY:"auto"},
  dropdownItem:     {padding:"6px 8px",borderRadius:4,cursor:"pointer",fontSize:13,color:"#e8eaed"},
  dropdownItemActive:{background:ACCENT,color:"#1c2127",fontWeight:600},
};
// CSS wird vom build.js als statische <style>-Datei injiziert (Stromplaner.css)
