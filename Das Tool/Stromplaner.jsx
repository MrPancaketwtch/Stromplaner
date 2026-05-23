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

const BREAKER_TYPES    = ["B","C","D","K"];
const PROTECTION_TYPES = ["LS","RCD","RCBO"];

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
  protection: o.protection || (o.connector==="SCHUKO"||o.connector==="MC" ? "RCBO" : "LS"),
  // Multicore: number of slots (default 6 if not set)
  mcSlots:    isMulticore(o.connector) ? (o.mcSlots||6) : undefined,
});
const migrateBoxType = (bt) => ({ ...bt, outlets: bt.outlets.map((o,i)=>migrateOutlet(o,i)) });
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

  const open_ = ()=>{
    if(trigRef.current){
      const r=trigRef.current.getBoundingClientRect();
      const spaceBelow=window.innerHeight-r.bottom;
      const dropH=Math.min(options.length*32+60,340);
      const top=spaceBelow<dropH ? r.top+window.scrollY-dropH-4 : r.bottom+window.scrollY+2;
      setPos({top,left:r.left+window.scrollX,width:Math.max(r.width,260)});
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

  const open_ = ()=>{
    if(trigRef.current){
      const r=trigRef.current.getBoundingClientRect();
      const spaceBelow=window.innerHeight-r.bottom;
      const dropH=Math.min(options.length*32+60,340);
      const top=spaceBelow<dropH ? r.top+window.scrollY-dropH-4 : r.bottom+window.scrollY+2;
      setPos({top,left:r.left+window.scrollX,width:Math.max(r.width,260)});
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

  // Hauptanschlüsse: [{id, name, amp}]
  const [mainConns, setMainConns] = useState([]);

  const [boxTypes,   setBoxTypes]   = useState(clone(DEFAULT_BOX_TYPES));
  const [loads,      setLoads]      = useState(clone(DEFAULT_LOADS));
  // instances: {id, typeId, name, parentId, parentOutletId, mainConnectionId}
  const [instances,  setInstances]  = useState([]);
  // placements: {id, instanceId, outletId, mcSlot(num|null), loadId}
  const [placements, setPlacements] = useState([]);
  const [activePlan,   setActivePlan]   = useState(null);
  const [inspMeta,     setInspMeta]     = useState({ inspector:"", date:new Date().toISOString().slice(0,10), equipment:"" });
  const [inspResults,  setInspResults]  = useState({});
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
          if(d.boxTypes)   setBoxTypes(d.boxTypes.map(migrateBoxType));
          if(d.loads)      setLoads(d.loads.map(l=>({...l,threePhase:l.threePhase||false})));
          if(d.instances)   setInstances(d.instances.map(migrateInstance));
          if(d.placements)  setPlacements(d.placements);
          if(d.inspMeta)    setInspMeta(d.inspMeta);
          if(d.inspResults) setInspResults(d.inspResults);
        }
      }
    } catch(e){ console.warn("Autosave load error",e); }
    setLoaded(true);
  },[]);

  // Save on every change (debounced 600ms)
  const saveTimer = useRef(null);
  useEffect(()=>{
    if(!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>{
      try {
        const data={_format:"stromplaner",_version:4,meta,mainConns,boxTypes,loads,instances,placements,inspMeta,inspResults};
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch(e){ console.warn("Autosave error",e); }
    },600);
    return ()=>clearTimeout(saveTimer.current);
  },[meta,mainConns,boxTypes,loads,instances,placements,inspMeta,inspResults,loaded]);

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
    const totalAmp = load.watt/VOLT;
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
  const rootInstances = instances.filter(i=>!i.parentId);

  const isOverloaded = useCallback((instanceId)=>{
    const t=totalLoad(instanceId);
    const inst=instById[instanceId];
    const type=inst?boxTypeById[inst.typeId]:null;
    const maxA=type?.feedAmp||0;
    if(!maxA) return false;
    return Math.max(t.L1,t.L2,t.L3)>maxA;
  },[totalLoad,instById,boxTypeById]);

  /* ── Instance actions ──────────────────────────────────────────────────── */
  const addInstance = (typeId)=>{
    const type=boxTypeById[typeId]; if(!type) return;
    const count=instances.filter(i=>i.typeId===typeId).length;
    setInstances(s=>[...s,{
      id:uid(),typeId,
      name:count>0?`${type.name} #${count+1}`:type.name,
      parentId:null,parentOutletId:null,mainConnectionId:null,
    }]);
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

  /* ── JSON Save/Load ────────────────────────────────────────────────────── */
  const saveJSON=()=>{
    const data={_format:"stromplaner",_version:4,meta,mainConns,boxTypes,loads,instances,placements};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url;
    a.download=`Stromplan_${meta.production.replace(/\s+/g,"_")}.json`;
    a.click(); URL.revokeObjectURL(url);
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
        if(d.boxTypes)   setBoxTypes(d.boxTypes.map(migrateBoxType));
        if(d.loads)      setLoads(d.loads.map(l=>({...l,threePhase:l.threePhase||false})));
        if(d.instances)   setInstances(d.instances.map(migrateInstance));
        if(d.placements)  setPlacements(d.placements);
        if(d.inspMeta)    setInspMeta(d.inspMeta);
        if(d.inspResults) setInspResults(d.inspResults);
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
        const amp=l?round2(l.watt/VOLT):"";
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
    loads.forEach(l=>lRows.push([l.name,l.watt,round2(l.watt/VOLT),l.threePhase?"Ja":"Nein"]));
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
        const amp=round2(l.watt/VOLT);
        let ph="",slot="";
        if(l.threePhase){ ph="L1+L2+L3"; }
        else if(out&&isMulticore(out.connector)){ const s=p.mcSlot||1; ph=PHASES[(s-1)%3]; slot=`Steckplatz ${s}`; }
        else { ph=out?.phase||""; }
        return {name:l.name,outlet:out?.label||"",slot,ph,watt:l.watt,amp,breaker:out?.breaker||"",prot:out?.protection||""};
      }).filter(Boolean);
      body+=`<div style="page-break-inside:avoid;margin-top:18px">
        <h2 style="font-size:13px;background:#2e75b6;color:#fff;padding:6px 10px;margin:0 0 6px;border-radius:4px">${inst.name} <span style="font-weight:400;font-size:11px">(${type?.name||""} · ${conn} · max ${maxA}A)</span></h2>
        <div style="font-size:11px;color:#555;margin-bottom:6px">hängt an: ${inst.parentId?instById[inst.parentId]?.name:"— Einspeisung —"}</div>
        <div style="display:flex;gap:6px;margin-bottom:8px">${phBar(tot,maxA)}</div>`;
      if(rows2.length){
        body+=`<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#eee">
          ${["Verbraucher","Anschluss","Steckplatz","Phase","W","A","Sich.","Schutz"].map(h=>`<th style="padding:3px 5px;border:1px solid #ddd">${h}</th>`).join("")}</tr></thead><tbody>`;
        rows2.forEach(r=>{ body+=`<tr>${[r.name,r.outlet,r.slot,r.ph,r.watt,r.amp,r.breaker,r.prot].map(v=>`<td style="padding:2px 5px;border:1px solid #ddd">${v}</td>`).join("")}</tr>`; });
        body+=`</tbody></table>`;
      } else body+=`<p style="font-size:11px;color:#999;font-style:italic">Keine Verbraucher gesteckt.</p>`;
      body+=`</div>`;
    });
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
    ["boxtypes","Kasten-Typen"],["loads","Verbraucher"],
  ];
  const sharedProps={ instances,instById,boxTypeById,totalLoad,isOverloaded,rootInstances,mainConns,mainConnById };

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      <header style={S.header}>
        <div style={S.logo}>⚡ STROMPLANER</div>
        <div style={S.headerMeta}>{meta.production} · v{meta.version} · {meta.date}</div>
        <span style={{fontSize:10,color:"#555",marginLeft:4}} title="Automatisch gespeichert">💾 auto</span>
        <label style={S.ghostBtn}>↥ Laden<input type="file" accept=".json" onChange={loadJSON} style={{display:"none"}}/></label>
        <button style={S.ghostBtn} onClick={saveJSON}>💾 Speichern</button>
        <button style={S.ghostBtn} onClick={resetAll}>↺ Neu</button>
        <button style={S.ghostBtn} onClick={exportPDF}>🖨 PDF</button>
        <button style={S.exportBtn} onClick={exportExcel}>⬇ Excel</button>
      </header>
      <nav style={S.nav}>
        {TABS.map(([k,label])=>(
          <button key={k} style={{...S.navBtn,...(tab===k?S.navBtnActive:{})}} onClick={()=>setTab(k)}>{label}</button>
        ))}
      </nav>
      <main style={S.main}>
        {tab==="config"   && <ConfigTab   {...sharedProps} meta={meta} setMeta={setMeta} boxTypes={boxTypes}
            addInstance={addInstance} removeInstance={removeInstance} updateInstance={updateInstance}
            setParentWithValidation={setParentWithValidation}
            mainConns={mainConns} addMainConn={addMainConn} updateMainConn={updateMainConn} removeMainConn={removeMainConn} />}
        {tab==="plan"     && <PlanTab     {...sharedProps} loads={loads} loadById={loadById}
            placements={placements} addPlacement={addPlacement} updatePlacement={updatePlacement} removePlacement={removePlacement}
            activePlan={activePlan} setActivePlan={setActivePlan} ownLoad={ownLoad} meta={meta} />}
        {tab==="overview" && <OverviewTab {...sharedProps} meta={meta} />}
        {tab==="schematic"&& <SchematicTab {...sharedProps} meta={meta} />}
        {tab==="boxtypes" && <BoxTypesTab  boxTypes={boxTypes} setBoxTypes={setBoxTypes} instances={instances} />}
        {tab==="loads"       && <LoadsTab       loads={loads} setLoads={setLoads} />}
        {tab==="inspection"  && <InspectionTab  {...sharedProps} inspMeta={inspMeta} setInspMeta={setInspMeta} inspResults={inspResults} setInspResults={setInspResults} />}
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Konfiguration
══════════════════════════════════════════════════════════════════════════ */
function ConfigTab({ meta,setMeta,boxTypes,instances,instById,boxTypeById,addInstance,removeInstance,updateInstance,setParentWithValidation,isOverloaded,mainConns,addMainConn,updateMainConn,removeMainConn }) {
  const [pick,setPick]=useState(boxTypes[0]?.id||"");
  const sortedTypes=alphaSort(boxTypes,"name");
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
            {sortedTypes.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
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
                const sortedOther=alphaSort(instances.filter(o=>o.id!==inst.id),"name");
                const parentOutlets=parentType?sortOutlets(parentType.outlets):[];
                // Belegte Anschlüsse ausblenden (anderer Kasten hängt schon dort)
                const takenOutletIds=new Set(instances.filter(i=>i.id!==inst.id&&i.parentId===inst.parentId&&i.parentId).map(i=>i.parentOutletId).filter(Boolean));
                const availableOutlets=parentOutlets.filter(o=>!takenOutletIds.has(o.id)||o.id===inst.parentOutletId);
                // Only show Hauptanschluss picker for root instances
                const isRoot=!inst.parentId;
                return (
                  <tr key={inst.id}>
                    <td style={S.td}>{ol&&<span title="Überlastet!" style={{color:"#e74c3c",fontWeight:800,fontSize:16}}>⚠</span>}</td>
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
                        {availableOutlets.map(o=><option key={o.id} value={o.id}>{o.label} ({o.amp}A)</option>)}
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
        <p style={S.hint}>💡 Phasen bleiben beim Aufstecken erhalten (L1→L1). Beim Aufstecken auf kleineren Anschluss erscheint eine Warnung.</p>
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Steckplan
══════════════════════════════════════════════════════════════════════════ */
function PlanTab({ instances,boxTypeById,loads,loadById,instById,placements,addPlacement,updatePlacement,removePlacement,activePlan,setActivePlan,ownLoad,totalLoad,isOverloaded,rootInstances,mainConns,mainConnById,meta }) {
  useEffect(()=>{
    if(!activePlan&&instances.length) setActivePlan(instances[0].id);
  },[instances,activePlan,setActivePlan]);

  if(instances.length===0)
    return <Section title="Steckplan"><p style={S.empty}>Aktiviere zuerst Kästen unter „1 · Konfiguration".</p></Section>;

  const inst   = instances.find(i=>i.id===activePlan)||instances[0];
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
  const loadOptions=sortedLoads.map(l=>({ value:l.id, label:`${l.name} (${l.watt}W${l.threePhase?" 3ph":""})` }));

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
        {instances.map(i=>{
          const ol=isOverloaded(i.id);
          return (
            <button key={i.id} style={{...S.boxTab,...(i.id===inst.id?S.boxTabActive:{}),...(ol?{borderColor:"#e74c3c"}:{})}} onClick={()=>setActivePlan(i.id)}>
              {ol&&<span style={{color:"#e74c3c",marginRight:4,fontWeight:800}}>⚠</span>}
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

        <button style={{...S.primaryBtn,marginTop:12}} onClick={()=>addPlacement(inst.id)}>+ Verbraucher stecken</button>

        {rows.length===0 ? <p style={S.empty}>Noch nichts gesteckt.</p> : (
          <div style={{overflowX:"auto"}}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Verbraucher</th><th style={S.th}>Anschluss</th><th style={S.th}>Steckplatz</th>
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
                const amp=l?round2(l.watt/VOLT):"";
                // Multicore slot options
                const showMcSlot=outlet&&isMulticore(outlet.connector);
                const mcOptions=showMcSlot?mcSlotOptions(outlet):[];
                return (
                  <tr key={p.id}>
                    <td style={S.td}>
                      <InlineSelect options={loadOptions} value={p.loadId} onChange={v=>updatePlacement(p.id,{loadId:v,outletId:"",mcSlot:null})} placeholder="Verbraucher…" style={{minWidth:180}}/>
                    </td>
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
  const addOutlet=(boxId)=>setBoxTypes(s=>s.map(b=>b.id!==boxId?b:{...b,outlets:[...b.outlets,{id:uid(),label:`Anschluss ${b.outlets.length+1}`,connector:"SCHUKO",amp:16,phase:"L1",breaker:"C",protection:"RCBO"}]}));
  const removeOutlet=(boxId,outletId)=>setBoxTypes(s=>s.map(b=>b.id!==boxId?b:{...b,outlets:b.outlets.filter(o=>o.id!==outletId)}));
  const addType=()=>{ const id="NEU_"+uid(); setBoxTypes(s=>[...s,{id,name:"Neuer Kasten",feedConnector:"CEE32",feedAmp:32,outlets:[]}]); setOpenId(id); };
  const removeType=(id)=>{ if(instances.some(i=>i.typeId===id)){alert("Kasten-Typ ist in Benutzung und kann nicht gelöscht werden.");return;} if(!confirm("Kasten-Typ wirklich löschen?"))return; setBoxTypes(s=>s.filter(b=>b.id!==id)); };
  const sortedTypes=alphaSort(boxTypes,"name");
  return (
    <Section title="Kasten-Typen" subtitle="Jeder physische Steckplatz = ein Anschluss. Bei Multicore: Steckplatzanzahl konfigurierbar, Phase rotiert automatisch (L1/L2/L3).">
      <button style={S.primaryBtn} onClick={addType}>+ Neuen Kasten-Typ</button>
      <div style={{marginTop:16}}>
        {sortedTypes.map(b=>(
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
                      {Object.entries(CONN).sort((a,b)=>a[1].label.localeCompare(b[1].label,"de")).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Max (A)"><input type="number" style={S.input} value={b.feedAmp} onChange={e=>update(b.id,{feedAmp:+e.target.value})}/></Field>
                </div>
                <div style={{textAlign:"right",marginTop:4}}>
                  <button style={S.dangerBtnWide} onClick={()=>removeType(b.id)}>Löschen</button>
                </div>
                <div style={{overflowX:"auto"}}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Name / Steckplatz</th><th style={S.th}>Stecker</th><th style={S.th}>A</th>
                    <th style={S.th}>Phase</th><th style={S.th}>Steckplätze*</th><th style={S.th}>Sich.</th><th style={S.th}>Schutz</th><th style={S.th}></th>
                  </tr></thead>
                  <tbody>
                    {b.outlets.map(o=>(
                      <tr key={o.id}>
                        <td style={S.td}><input style={S.inputSm} value={o.label} onChange={e=>updateOutlet(b.id,o.id,{label:e.target.value})}/></td>
                        <td style={S.td}>
                          <select style={S.selectSm} value={o.connector} onChange={e=>updateOutlet(b.id,o.id,{connector:e.target.value})}>
                            {Object.entries(CONN).sort((a,b2)=>a[1].label.localeCompare(b2[1].label,"de")).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
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
                        <td style={S.td}>{o.protection==="RCD" ? <span style={{color:"#555",fontSize:11}}>—</span> : <select style={{...S.selectSm,width:55}} value={o.breaker||"C"} onChange={e=>updateOutlet(b.id,o.id,{breaker:e.target.value})}>{BREAKER_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>}</td>
                        <td style={S.td}><select style={{...S.selectSm,width:70}} value={o.protection||"LS"} onChange={e=>updateOutlet(b.id,o.id,{protection:e.target.value})}>{PROTECTION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></td>
                        <td style={S.td}><button style={S.dangerBtn} onClick={()=>removeOutlet(b.id,o.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <p style={{...S.hint,marginTop:6}}>* Steckplätze gilt nur für Multicore-Anschlüsse. Phase rotiert automatisch: Steckplatz 1=L1, 2=L2, 3=L3, 4=L1, …</p>
                <button style={S.secondaryBtn} onClick={()=>addOutlet(b.id)}>+ Anschluss hinzufügen</button>
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
  const add=()=>setLoads(s=>[...s,{id:uid(),name:"Neuer Verbraucher",watt:100,threePhase:false}]);
  const update=(id,patch)=>setLoads(s=>s.map(l=>l.id===id?{...l,...patch}:l));
  const remove=(id)=>setLoads(s=>s.filter(l=>l.id!==id));
  return (
    <Section title="Verbraucher-Stammdaten" subtitle="3-phasige Verbraucher werden gleichmäßig auf L1/L2/L3 verteilt und können nur auf CEE-Rot / Powerlock Anschlüsse gesteckt werden.">
      <button style={S.primaryBtn} onClick={add}>+ Verbraucher</button>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Name</th><th style={S.th}>W</th><th style={S.th}>A</th><th style={S.th}>3-phasig</th><th style={S.th}></th></tr></thead>
        <tbody>
          {alphaSort(loads,"name").map(l=>(
            <tr key={l.id}>
              <td style={S.td}><input style={S.inputSm} value={l.name} onChange={e=>update(l.id,{name:e.target.value})}/></td>
              <td style={S.td}><input type="number" style={{...S.inputSm,width:90}} value={l.watt} onChange={e=>update(l.id,{watt:+e.target.value})}/></td>
              <td style={S.td}>{l.threePhase?`${round2(l.watt/VOLT)}/Ph`:round2(l.watt/VOLT)}</td>
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
function OverviewTab({ instances,instById,boxTypeById,totalLoad,rootInstances,mainConns,mainConnById,meta,isOverloaded }) {
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
                  <td style={S.td}>{pct>100&&<span style={{color:"#e74c3c",fontWeight:800}}>⚠</span>}</td>
                  <td style={S.td}>{inst.name}</td>
                  <td style={{...S.td,fontSize:11}}>{conn}</td>
                  <td style={S.td}>{inst.parentId?instById[inst.parentId]?.name:"— Einspeisung —"}</td>
                  <td style={S.td}>{round2(t.L1)}</td><td style={S.td}>{round2(t.L2)}</td><td style={S.td}>{round2(t.L3)}</td>
                  <td style={S.td}>{maxA}</td>
                  <td style={{...S.td,color:scol,fontWeight:600}}>{stat}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Schaltbild
══════════════════════════════════════════════════════════════════════════ */
function SchematicTab({ instances,instById,boxTypeById,totalLoad,rootInstances,mainConns,mainConnById,meta,isOverloaded }) {
  if(instances.length===0) return <Section title="Schaltbild"><p style={S.empty}>Aktiviere zuerst Kästen.</p></Section>;

  const getChildren=(parentId)=>instances.filter(i=>i.parentId===parentId);
  const countLeaves=(id)=>{ const ch=getChildren(id); return ch.length===0?1:ch.reduce((s,c)=>s+countLeaves(c.id),0); };

  const ROW_H=90, COL_W=220, NODE_W=180, NODE_H=70, PAD=20;
  const positions={};
  const assignPos=(id,depth,yStart)=>{
    const ch=getChildren(id); const leaves=countLeaves(id);
    positions[id]={x:depth*COL_W+PAD,y:yStart+(leaves*ROW_H)/2-NODE_H/2};
    let curY=yStart; ch.forEach(c=>{ const cl=countLeaves(c.id); assignPos(c.id,depth+1,curY); curY+=cl*ROW_H; });
  };
  rootInstances.forEach((r,i)=>{ const prev=rootInstances.slice(0,i).reduce((s,ri)=>s+countLeaves(ri.id),0); assignPos(r.id,0,prev*ROW_H+PAD); });

  const totalLeaves=rootInstances.reduce((s,r)=>s+countLeaves(r.id),0);
  const maxDepth=instances.reduce((mx,i)=>{ let d=0,cur=i; while(cur.parentId){d++;cur=instById[cur.parentId]||{};if(d>20)break;} return Math.max(mx,d); },0);
  const svgW=(maxDepth+1)*COL_W+PAD*2+NODE_W;
  const svgH=Math.max(totalLeaves*ROW_H+PAD*2,200);

  const nodeColor=(inst)=>{ const t=totalLoad(inst.id); const type=boxTypeById[inst.typeId]; const maxA=type?.feedAmp||0; const peak=Math.max(t.L1,t.L2,t.L3); const pct=maxA?(peak/maxA)*100:0; return pct>100?"#c0392b":pct>80?"#e67e22":peak>0?"#27ae60":"#2e75b6"; };
  const edges=instances.filter(i=>i.parentId&&positions[i.id]&&positions[i.parentId]).map(inst=>{ const from=positions[inst.parentId],to=positions[inst.id]; return {x1:from.x+NODE_W,y1:from.y+NODE_H/2,x2:to.x,y2:to.y+NODE_H/2,inst}; });

  return (
    <Section title="Schaltbild" subtitle="Grün = OK · Orange = >80% · Rot = Überlast. Zahlen = Gesamtlast inkl. aufgesteckter Kästen.">
      <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"75vh",background:"#1b2026",borderRadius:8,padding:12}}>
        <svg width={svgW} height={svgH} style={{display:"block",minWidth:svgW}}>
          {/* Hauptanschluss boxes */}
          {mainConns.map((mc,mci)=>{
            const connInsts=rootInstances.filter(i=>i.mainConnectionId===mc.id);
            if(!connInsts.length) return null;
            const ys=connInsts.map(i=>positions[i.id]?.y).filter(Boolean);
            if(!ys.length) return null;
            const cy=(Math.min(...ys)+Math.max(...ys)+NODE_H)/2;
            return (
              <g key={mc.id}>
                <rect x={PAD} y={cy-32} width={140} height={64} rx={6} fill="#f5a623" opacity={0.12} stroke="#f5a623" strokeWidth={2}/>
                <text x={PAD+70} y={cy-14} textAnchor="middle" fill="#f5a623" fontSize={10} fontWeight="bold">Hauptanschluss</text>
                <text x={PAD+70} y={cy+4}  textAnchor="middle" fill="#f5a623" fontSize={12} fontWeight="bold">{mc.name}</text>
                {mc.amp&&<text x={PAD+70} y={cy+20} textAnchor="middle" fill="#f5a623" fontSize={10}>max {mc.amp}A</text>}
                {connInsts.map(ri=>{ const pos=positions[ri.id]; if(!pos) return null; return <line key={ri.id} x1={PAD+140} y1={cy} x2={pos.x} y2={pos.y+NODE_H/2} stroke="#f5a623" strokeWidth={1.5} strokeDasharray="5,3" opacity={0.6}/>; })}
              </g>
            );
          })}
          {/* Edges */}
          {edges.map((e,i)=>{ const t=totalLoad(e.inst.id); const mx=(e.x1+e.x2)/2; return (
            <g key={i}>
              <path d={`M${e.x1} ${e.y1} C${mx} ${e.y1},${mx} ${e.y2},${e.x2} ${e.y2}`} fill="none" stroke="#3a424c" strokeWidth={2}/>
              <text x={mx} y={Math.min(e.y1,e.y2)+Math.abs(e.y1-e.y2)/2-4} textAnchor="middle" fill="#9aa4af" fontSize={9}>{`L1:${round2(t.L1)} L2:${round2(t.L2)} L3:${round2(t.L3)}`}</text>
            </g>
          ); })}
          {/* Nodes */}
          {instances.map(inst=>{ const pos=positions[inst.id]; if(!pos) return null;
            const type=boxTypeById[inst.typeId]; const t=totalLoad(inst.id); const maxA=type?.feedAmp||0;
            const peak=Math.max(t.L1,t.L2,t.L3); const pct=maxA?Math.round((peak/maxA)*100):0;
            const col=nodeColor(inst); const conn=type?(CONN[type.feedConnector]?.label||""):"";
            return (
              <g key={inst.id} transform={`translate(${pos.x},${pos.y})`}>
                <rect width={NODE_W} height={NODE_H} rx={8} fill="#252b33" stroke={col} strokeWidth={2}/>
                <rect width={NODE_W} height={22} rx={8} fill={col} opacity={0.9}/>
                <rect y={14} width={NODE_W} height={8} fill={col} opacity={0.9}/>
                <text x={NODE_W/2} y={15} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="bold">{inst.name.length>22?inst.name.slice(0,20)+"…":inst.name}</text>
                <text x={6}       y={34} fill="#9aa4af" fontSize={9}>{conn}</text>
                <text x={NODE_W-6} y={34} textAnchor="end" fill="#9aa4af" fontSize={9}>max {maxA}A</text>
                {PHASES.map((ph,pi)=>(
                  <g key={ph} transform={`translate(${pi*(NODE_W/3)},36)`}>
                    <text x={NODE_W/6} y={13} textAnchor="middle" fill="#666" fontSize={9}>{ph}</text>
                    <text x={NODE_W/6} y={25} textAnchor="middle" fill="#e8eaed" fontSize={11} fontWeight="700">{round2(t[ph])}</text>
                  </g>
                ))}
                {maxA>0&&(<>
                  <rect x={6} y={NODE_H-10} width={NODE_W-12} height={5} rx={2} fill="#1b2026"/>
                  <rect x={6} y={NODE_H-10} width={Math.min((NODE_W-12)*(peak/maxA),NODE_W-12)} height={5} rx={2} fill={col}/>
                  <text x={NODE_W-6} y={NODE_H-3} textAnchor="end" fill={col} fontSize={8}>{pct}%</text>
                </>)}
              </g>
            );
          })}
        </svg>
      </div>
    </Section>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function Section({title,subtitle,children}){ return <section style={S.section}><h2 style={S.h2}>{title}</h2>{subtitle&&<p style={S.subtitle}>{subtitle}</p>}{children}</section>; }
function Field({label,children}){ return <label style={S.field}><span style={S.fieldLabel}>{label}</span>{children}</label>; }

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Errichtungsprüfung
══════════════════════════════════════════════════════════════════════════ */
function InspectionTab({ instances, boxTypeById, inspMeta, setInspMeta, inspResults, setInspResults }) {
  const updMeta = (patch) => setInspMeta(s=>({...s,...patch}));

  const getIR = (iid) => inspResults[iid] || { voltL1N:"",voltL2N:"",voltL3N:"",voltL1L2:"",voltL2L3:"",voltL1L3:"",voltNPE:"",voltL1PE:"",voltL2PE:"",voltL3PE:"",phaseRot:"",outlets:{} };
  const updIR = (iid, patch) => setInspResults(s=>({ ...s, [iid]:{ ...getIR(iid), ...patch } }));

  const getOR = (iid, oid) => (getIR(iid).outlets||{})[oid] || { rPE:"",rPEL2:"",rPEL3:"",rIso:"",rIsoL2:"",rIsoL3:"",rcdT1:"",rcdIan:"",ok:false };
  const updOR = (iid, oid, patch) => {
    const ir = getIR(iid);
    setInspResults(s=>({ ...s, [iid]:{ ...ir, outlets:{ ...(ir.outlets||{}), [oid]:{ ...getOR(iid,oid), ...patch } } } }));
  };

  // Gibt true/false/null (null = leer) zurück
  const chk = (val, min, max) => {
    if(val==="" || val===undefined) return null;
    const n=parseFloat(val); if(isNaN(n)) return null;
    if(min!==undefined && n<min) return false;
    if(max!==undefined && n>max) return false;
    return true;
  };
  const inpBorder = (ok) => ok===true ? {borderColor:"#2ecc71"} : ok===false ? {borderColor:"#e74c3c"} : {};
  const cellBg    = (ok) => ({...S.td, background: ok===true?"rgba(46,204,113,0.12)": ok===false?"rgba(231,76,60,0.12)":"transparent"});

  const exportInspectionPDF = () => {
    const pw = window.open("","_blank","width=920,height=750");
    if(!pw){ alert("Popup-Blocker aktiv – bitte erlauben."); return; }

    const ck = (val,lo,hi) => {
      if(val===""||val===undefined) return "";
      const n=parseFloat(val); if(isNaN(n)) return "";
      if(lo!==undefined&&n<lo) return "✗";
      if(hi!==undefined&&n>hi) return "✗";
      return "✓";
    };
    const okBg  = (v) => v==="✓"?"background:#e8f8f0":v==="✗"?"background:#fde8e8":"";
    const okCol = (v) => v==="✓"?"color:#27ae60":v==="✗"?"color:#c0392b":"color:#999";
    const th = `padding:3px 5px;border:1px solid #ddd;font-size:9px;text-align:center;background:#eee`;
    const td = `padding:2px 5px;border:1px solid #ddd;font-size:10px;text-align:center`;

    let body = `<h1 style="font-size:17px;margin:0 0 6px">🔌 Errichtungsprüfungsprotokoll</h1>
      <table style="font-size:11px;margin-bottom:16px;border-collapse:collapse">
        <tr><td style="padding:1px 14px 1px 0;color:#666">Prüfer</td><td><b>${inspMeta.inspector||"–"}</b></td></tr>
        <tr><td style="padding:1px 14px 1px 0;color:#666">Datum</td><td><b>${inspMeta.date||"–"}</b></td></tr>
        <tr><td style="padding:1px 14px 1px 0;color:#666">Prüfmittel</td><td><b>${inspMeta.equipment||"–"}</b></td></tr>
      </table>`;

    alphaSort(instances,"name").forEach(inst => {
      const type     = boxTypeById[inst.typeId];
      const outlets  = type ? sortOutlets(type.outlets) : [];
      const ir       = getIR(inst.id);
      const outs1    = outlets.filter(o=>!is3ph(o.connector));
      const outs3    = outlets.filter(o=> is3ph(o.connector));
      const rcd1     = outs1.some(o=>o.protection==="RCD"||o.protection==="RCBO");
      const rcd3     = outs3.some(o=>o.protection==="RCD"||o.protection==="RCBO");

      body += `<div style="page-break-inside:avoid;margin-top:16px">
        <h2 style="font-size:12px;background:#1c2127;color:#fff;padding:5px 10px;margin:0 0 6px;border-radius:4px">
          ${inst.name} <span style="font-weight:400;font-size:10px">${type?.name||""} · ${CONN[type?.feedConnector]?.label||""} ${type?.feedAmp||""}A</span>
        </h2>`;

      // Voltage table
      const vr = (lbl,val,norm,ok) =>
        `<tr style="${okBg(ok)}"><td style="padding:2px 6px;border:1px solid #ddd;font-size:10px">${lbl}</td>
         <td style="padding:2px 6px;border:1px solid #ddd;font-size:10px;font-weight:700">${val||""}</td>
         <td style="padding:2px 6px;border:1px solid #ddd;font-size:9px;color:#777">${norm}</td>
         <td style="padding:2px 6px;border:1px solid #ddd;font-size:10px;font-weight:700;${okCol(ok)}">${ok}</td></tr>`;

      body += `<table style="border-collapse:collapse;width:300px;margin-bottom:10px;float:left;margin-right:16px">
        <thead><tr><th style="${th};text-align:left">Messgröße</th><th style="${th}">Wert (V)</th><th style="${th}">Norm</th><th style="${th}">OK</th></tr></thead><tbody>
        ${vr("U L1–N", ir.voltL1N,"207–253 V",ck(ir.voltL1N,207,253))}
        ${vr("U L2–N", ir.voltL2N,"207–253 V",ck(ir.voltL2N,207,253))}
        ${vr("U L3–N", ir.voltL3N,"207–253 V",ck(ir.voltL3N,207,253))}
        ${vr("U L1–L2",ir.voltL1L2,"360–440 V",ck(ir.voltL1L2,360,440))}
        ${vr("U L2–L3",ir.voltL2L3,"360–440 V",ck(ir.voltL2L3,360,440))}
        ${vr("U L1–L3",ir.voltL1L3,"360–440 V",ck(ir.voltL1L3,360,440))}
        ${vr("U N–PE", ir.voltNPE, "≤ 2 V",    ck(ir.voltNPE,undefined,2))}
        ${vr("U L1–PE",ir.voltL1PE,"207–253 V",ck(ir.voltL1PE,207,253))}
        ${vr("U L2–PE",ir.voltL2PE,"207–253 V",ck(ir.voltL2PE,207,253))}
        ${vr("U L3–PE",ir.voltL3PE,"207–253 V",ck(ir.voltL3PE,207,253))}
        <tr><td style="padding:2px 6px;border:1px solid #ddd;font-size:10px">Drehfeld</td>
          <td colspan="2" style="padding:2px 6px;border:1px solid #ddd;font-size:10px">${ir.phaseRot==="rechts"?"Rechtsdrehfeld":ir.phaseRot==="links"?"Linksdrehfeld":"–"}</td>
          <td style="padding:2px 6px;border:1px solid #ddd;font-size:10px;font-weight:700;${ir.phaseRot==="rechts"?"color:#27ae60":ir.phaseRot==="links"?"color:#c0392b":"color:#999"}">${ir.phaseRot==="rechts"?"✓":ir.phaseRot==="links"?"✗":"–"}</td>
        </tr></tbody></table><div style="clear:both"></div>`;

      // 1-phase table
      if(outs1.length){
        if(outs3.length) body+=`<p style="font-size:10px;font-weight:700;margin:0 0 3px">1-phasige Anschlüsse</p>`;
        body+=`<table style="border-collapse:collapse;width:100%;margin-bottom:8px"><thead><tr>
          <th style="${th};text-align:left">Anschluss</th><th style="${th}">Schutz</th>
          <th style="${th}">R_PE (Ω)<br>≤0,5</th><th style="${th}">R_iso (MΩ)<br>≥1</th>
          ${rcd1?`<th style="${th}">FI t@IΔn<br>≤300ms</th><th style="${th}">FI I_an (mA)</th>`:""}
          <th style="${th}">OK</th></tr></thead><tbody>`;
        outs1.forEach(o=>{
          const or=getOR(inst.id,o.id), isRCD=o.protection==="RCD"||o.protection==="RCBO";
          const pe=ck(or.rPE,undefined,0.5), iso=ck(or.rIso,1), t1=isRCD?ck(or.rcdT1,undefined,300):"";
          body+=`<tr><td style="${td};text-align:left">${o.label}</td><td style="${td}">${o.protection} ${o.breaker}</td>
            <td style="${td};${okBg(pe)}">${or.rPE||""} <span style="font-size:8px;${okCol(pe)}">${pe}</span></td>
            <td style="${td};${okBg(iso)}">${or.rIso||""} <span style="font-size:8px;${okCol(iso)}">${iso}</span></td>
            ${rcd1?`<td style="${td};${isRCD?okBg(t1):"background:#f5f5f5"}">${isRCD?or.rcdT1||"":""} <span style="font-size:8px;${okCol(t1)}">${t1}</span></td>
                    <td style="${td};${isRCD?"":"background:#f5f5f5"}">${isRCD?or.rcdIan||"":""}</td>`:""}
            <td style="${td};font-weight:700;${okCol(or.ok?"✓":"")}">${or.ok?"✓":"—"}</td></tr>`;
        });
        body+=`</tbody></table>`;
      }

      // 3-phase table
      if(outs3.length){
        if(outs1.length) body+=`<p style="font-size:10px;font-weight:700;margin:0 0 3px">3-phasige Anschlüsse</p>`;
        body+=`<table style="border-collapse:collapse;width:100%;margin-bottom:8px"><thead><tr>
          <th style="${th};text-align:left">Anschluss</th><th style="${th}">Schutz</th>
          <th style="${th}">PE-L1<br>≤0,5Ω</th><th style="${th}">PE-L2</th><th style="${th}">PE-L3</th>
          <th style="${th}">iso-L1<br>≥1MΩ</th><th style="${th}">iso-L2</th><th style="${th}">iso-L3</th>
          ${rcd3?`<th style="${th}">FI t@IΔn<br>≤300ms</th><th style="${th}">FI I_an</th>`:""}
          <th style="${th}">OK</th></tr></thead><tbody>`;
        outs3.forEach(o=>{
          const or=getOR(inst.id,o.id), isRCD=o.protection==="RCD"||o.protection==="RCBO";
          const pe1=ck(or.rPE,undefined,0.5), pe2=ck(or.rPEL2,undefined,0.5), pe3=ck(or.rPEL3,undefined,0.5);
          const i1=ck(or.rIso,1), i2=ck(or.rIsoL2,1), i3=ck(or.rIsoL3,1);
          const t1=isRCD?ck(or.rcdT1,undefined,300):"";
          const c=(v,ok)=>`<td style="${td};${okBg(ok)}">${v||""} <span style="font-size:8px;${okCol(ok)}">${ok}</span></td>`;
          body+=`<tr><td style="${td};text-align:left">${o.label}</td><td style="${td}">${o.protection} ${o.breaker}</td>
            ${c(or.rPE,pe1)}${c(or.rPEL2,pe2)}${c(or.rPEL3,pe3)}
            ${c(or.rIso,i1)}${c(or.rIsoL2,i2)}${c(or.rIsoL3,i3)}
            ${rcd3?`<td style="${td};${isRCD?okBg(t1):"background:#f5f5f5"}">${isRCD?or.rcdT1||"":""} <span style="font-size:8px;${okCol(t1)}">${t1}</span></td>
                    <td style="${td};${isRCD?"":"background:#f5f5f5"}">${isRCD?or.rcdIan||"":""}</td>`:""}
            <td style="${td};font-weight:700;${okCol(or.ok?"✓":"")}">${or.ok?"✓":"—"}</td></tr>`;
        });
        body+=`</tbody></table>`;
      }

      body+=`</div>`;
    });

    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Errichtungsprüfung – ${inspMeta.date||""}</title>
      <style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#222;margin:0}</style>
      </head><body>${body}</body></html>`);
    pw.document.close();
    setTimeout(()=>{ pw.focus(); pw.print(); },600);
  };

  const sorted = alphaSort(instances,"name");

  return (
    <div>
      <Section title="Prüfungsdetails">
        <div style={S.metaGrid}>
          <Field label="Prüfer"><input style={S.input} value={inspMeta.inspector} onChange={e=>updMeta({inspector:e.target.value})}/></Field>
          <Field label="Datum"><input style={S.input} type="date" value={inspMeta.date} onChange={e=>updMeta({date:e.target.value})}/></Field>
          <Field label="Prüfmittel / Messgerät"><input style={S.input} value={inspMeta.equipment} onChange={e=>updMeta({equipment:e.target.value})}/></Field>
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
          const outlets1ph = outlets.filter(o=>!is3ph(o.connector));
          const outlets3ph = outlets.filter(o=> is3ph(o.connector));
          const hasRCD1ph  = outlets1ph.some(o=>o.protection==="RCD"||o.protection==="RCBO");
          const hasRCD3ph  = outlets3ph.some(o=>o.protection==="RCD"||o.protection==="RCBO");

          // Spannungsprüfung
          const okV1=chk(ir.voltL1N,207,253), okV2=chk(ir.voltL2N,207,253), okV3=chk(ir.voltL3N,207,253);
          const okL12=chk(ir.voltL1L2,360,440), okL23=chk(ir.voltL2L3,360,440), okL13=chk(ir.voltL1L3,360,440);
          const okNPE=chk(ir.voltNPE,undefined,2), okL1PE=chk(ir.voltL1PE,207,253), okL2PE=chk(ir.voltL2PE,207,253), okL3PE=chk(ir.voltL3PE,207,253);

          return (
            <Section key={inst.id}
              title={`🔌 ${inst.name}`}
              subtitle={`${type?.name||"?"} · Einspeisung: ${CONN[type?.feedConnector]?.label||""} ${type?.feedAmp||""}A`}>

              {/* ── Spannungsmessung + Drehfeld ── */}
              <div style={{...S.metaGrid,gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",marginBottom:6}}>
                <Field label="U L1–N (V)">
                  <input style={{...S.inputSm,...inpBorder(okV1)}} value={ir.voltL1N||""} onChange={e=>updIR(inst.id,{voltL1N:e.target.value})}/>
                  <span style={S.normHint}>207 – 253 V</span>
                </Field>
                <Field label="U L2–N (V)">
                  <input style={{...S.inputSm,...inpBorder(okV2)}} value={ir.voltL2N||""} onChange={e=>updIR(inst.id,{voltL2N:e.target.value})}/>
                  <span style={S.normHint}>207 – 253 V</span>
                </Field>
                <Field label="U L3–N (V)">
                  <input style={{...S.inputSm,...inpBorder(okV3)}} value={ir.voltL3N||""} onChange={e=>updIR(inst.id,{voltL3N:e.target.value})}/>
                  <span style={S.normHint}>207 – 253 V</span>
                </Field>
                <Field label="U L1–L2 (V)">
                  <input style={{...S.inputSm,...inpBorder(okL12)}} value={ir.voltL1L2||""} onChange={e=>updIR(inst.id,{voltL1L2:e.target.value})}/>
                  <span style={S.normHint}>360 – 440 V</span>
                </Field>
                <Field label="U L2–L3 (V)">
                  <input style={{...S.inputSm,...inpBorder(okL23)}} value={ir.voltL2L3||""} onChange={e=>updIR(inst.id,{voltL2L3:e.target.value})}/>
                  <span style={S.normHint}>360 – 440 V</span>
                </Field>
                <Field label="U L1–L3 (V)">
                  <input style={{...S.inputSm,...inpBorder(okL13)}} value={ir.voltL1L3||""} onChange={e=>updIR(inst.id,{voltL1L3:e.target.value})}/>
                  <span style={S.normHint}>360 – 440 V</span>
                </Field>
                <Field label="U N–PE (V)">
                  <input style={{...S.inputSm,...inpBorder(okNPE)}} value={ir.voltNPE||""} onChange={e=>updIR(inst.id,{voltNPE:e.target.value})}/>
                  <span style={S.normHint}>≤ 2 V</span>
                </Field>
                <Field label="U L1–PE (V)">
                  <input style={{...S.inputSm,...inpBorder(okL1PE)}} value={ir.voltL1PE||""} onChange={e=>updIR(inst.id,{voltL1PE:e.target.value})}/>
                  <span style={S.normHint}>207 – 253 V</span>
                </Field>
                <Field label="U L2–PE (V)">
                  <input style={{...S.inputSm,...inpBorder(okL2PE)}} value={ir.voltL2PE||""} onChange={e=>updIR(inst.id,{voltL2PE:e.target.value})}/>
                  <span style={S.normHint}>207 – 253 V</span>
                </Field>
                <Field label="U L3–PE (V)">
                  <input style={{...S.inputSm,...inpBorder(okL3PE)}} value={ir.voltL3PE||""} onChange={e=>updIR(inst.id,{voltL3PE:e.target.value})}/>
                  <span style={S.normHint}>207 – 253 V</span>
                </Field>
                <Field label="Drehfeld">
                  <select style={{...S.inputSm,width:"100%"}}
                    value={ir.phaseRot||""} onChange={e=>updIR(inst.id,{phaseRot:e.target.value})}>
                    <option value="">— nicht geprüft —</option>
                    <option value="rechts">Rechtsdrehfeld</option>
                    <option value="links">Linksdrehfeld</option>
                  </select>
                </Field>
              </div>

              {/* ── 1-phasige Anschlüsse ── */}
              {outlets1ph.length>0&&(
              <div style={{overflowX:"auto",marginBottom:outlets3ph.length?16:0}}>
                {outlets3ph.length>0&&<p style={{fontSize:11,color:"#9aa4af",margin:"0 0 6px"}}>1-phasige Anschlüsse</p>}
                <table style={{...S.table,minWidth:hasRCD1ph?920:620,width:"auto"}}>
                  <thead><tr>
                    <th style={S.th}>Anschluss</th><th style={S.th}>Stecker</th><th style={S.th}>A</th><th style={S.th}>Schutz</th>
                    <th style={S.th}>R_PE (Ω)<br/><span style={S.normHint}>≤ 0,5 Ω</span></th>
                    <th style={S.th}>R_iso (MΩ)<br/><span style={S.normHint}>≥ 1 MΩ</span></th>
                    {hasRCD1ph&&<th style={S.th}>FI t @ IΔn (ms)<br/><span style={S.normHint}>≤ 300 ms</span></th>}
                    {hasRCD1ph&&<th style={S.th}>FI I_an (mA)<br/><span style={S.normHint}>≤ IΔn</span></th>}
                    <th style={S.th}>OK?</th>
                  </tr></thead>
                  <tbody>
                    {outlets1ph.map(outlet=>{
                      const or    = getOR(inst.id,outlet.id);
                      const isRCD = outlet.protection==="RCD"||outlet.protection==="RCBO";
                      const okPE  = chk(or.rPE, undefined, 0.5);
                      const okIso = chk(or.rIso, 1, undefined);
                      const okT1  = isRCD ? chk(or.rcdT1, undefined, 300) : null;
                      return (
                        <tr key={outlet.id}>
                          <td style={S.td}>{outlet.label}</td>
                          <td style={{...S.td,fontSize:11,color:"#9aa4af"}}>{CONN[outlet.connector]?.label||outlet.connector}</td>
                          <td style={S.td}>{outlet.amp}</td>
                          <td style={{...S.td,fontSize:11}}>{outlet.protection} {outlet.breaker}</td>
                          <td style={cellBg(okPE)}><input type="number" step="0.01" placeholder="0,00" style={{...S.inputSm,width:72,...inpBorder(okPE)}} value={or.rPE} onChange={e=>updOR(inst.id,outlet.id,{rPE:e.target.value})}/></td>
                          <td style={cellBg(okIso)}><input type="number" step="0.1" placeholder="0,0" style={{...S.inputSm,width:72,...inpBorder(okIso)}} value={or.rIso} onChange={e=>updOR(inst.id,outlet.id,{rIso:e.target.value})}/></td>
                          {hasRCD1ph&&<td style={isRCD?cellBg(okT1):{...S.td,background:"#0e1216"}}>{isRCD&&<input type="number" step="1" placeholder="0" style={{...S.inputSm,width:72,...inpBorder(okT1)}} value={or.rcdT1} onChange={e=>updOR(inst.id,outlet.id,{rcdT1:e.target.value})}/>}</td>}
                          {hasRCD1ph&&<td style={isRCD?S.td:{...S.td,background:"#0e1216"}}>{isRCD&&<input type="number" step="1" placeholder="0" style={{...S.inputSm,width:72}} value={or.rcdIan} onChange={e=>updOR(inst.id,outlet.id,{rcdIan:e.target.value})}/>}</td>}
                          <td style={{...S.td,textAlign:"center"}}><input type="checkbox" checked={or.ok||false} onChange={e=>updOR(inst.id,outlet.id,{ok:e.target.checked})}/></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}

              {/* ── 3-phasige Anschlüsse ── */}
              {outlets3ph.length>0&&(
              <div style={{overflowX:"auto"}}>
                {outlets1ph.length>0&&<p style={{fontSize:11,color:"#9aa4af",margin:"0 0 6px"}}>3-phasige Anschlüsse</p>}
                <table style={{...S.table,minWidth:hasRCD3ph?920:620,width:"auto"}}>
                  <thead><tr>
                    <th style={S.th}>Anschluss</th><th style={S.th}>Stecker</th><th style={S.th}>A</th><th style={S.th}>Schutz</th>
                    <th style={{...S.th,fontSize:10}}>PE-L1<br/><span style={S.normHint}>≤0,5Ω</span></th>
                    <th style={{...S.th,fontSize:10}}>PE-L2<br/><span style={S.normHint}>≤0,5Ω</span></th>
                    <th style={{...S.th,fontSize:10}}>PE-L3<br/><span style={S.normHint}>≤0,5Ω</span></th>
                    <th style={{...S.th,fontSize:10}}>iso-L1<br/><span style={S.normHint}>≥1MΩ</span></th>
                    <th style={{...S.th,fontSize:10}}>iso-L2<br/><span style={S.normHint}>≥1MΩ</span></th>
                    <th style={{...S.th,fontSize:10}}>iso-L3<br/><span style={S.normHint}>≥1MΩ</span></th>
                    {hasRCD3ph&&<th style={{...S.th,fontSize:10}}>FI t@IΔn<br/><span style={S.normHint}>≤300ms</span></th>}
                    {hasRCD3ph&&<th style={{...S.th,fontSize:10}}>FI I_an<br/><span style={S.normHint}>≤IΔn</span></th>}
                    <th style={S.th}>OK?</th>
                  </tr></thead>
                  <tbody>
                    {outlets3ph.map(outlet=>{
                      const or     = getOR(inst.id,outlet.id);
                      const isRCD  = outlet.protection==="RCD"||outlet.protection==="RCBO";
                      const okPE   = chk(or.rPE,   undefined, 0.5), okPE2  = chk(or.rPEL2,  undefined, 0.5), okPE3  = chk(or.rPEL3,  undefined, 0.5);
                      const okIso  = chk(or.rIso,  1, undefined),   okIso2 = chk(or.rIsoL2, 1, undefined),   okIso3 = chk(or.rIsoL3, 1, undefined);
                      const okT1   = isRCD ? chk(or.rcdT1, undefined, 300) : null;
                      return (
                        <tr key={outlet.id}>
                          <td style={S.td}>{outlet.label}</td>
                          <td style={{...S.td,fontSize:11,color:"#9aa4af"}}>{CONN[outlet.connector]?.label||outlet.connector}</td>
                          <td style={S.td}>{outlet.amp}</td>
                          <td style={{...S.td,fontSize:11}}>{outlet.protection} {outlet.breaker}</td>
                          <td style={cellBg(okPE)}>  <input type="number" step="0.01" placeholder="–" style={{...S.inputSm,width:46,...inpBorder(okPE)}}   value={or.rPE}    onChange={e=>updOR(inst.id,outlet.id,{rPE:e.target.value})}/></td>
                          <td style={cellBg(okPE2)}> <input type="number" step="0.01" placeholder="–" style={{...S.inputSm,width:46,...inpBorder(okPE2)}}  value={or.rPEL2}  onChange={e=>updOR(inst.id,outlet.id,{rPEL2:e.target.value})}/></td>
                          <td style={cellBg(okPE3)}> <input type="number" step="0.01" placeholder="–" style={{...S.inputSm,width:46,...inpBorder(okPE3)}}  value={or.rPEL3}  onChange={e=>updOR(inst.id,outlet.id,{rPEL3:e.target.value})}/></td>
                          <td style={cellBg(okIso)}> <input type="number" step="0.1"  placeholder="–" style={{...S.inputSm,width:46,...inpBorder(okIso)}}  value={or.rIso}   onChange={e=>updOR(inst.id,outlet.id,{rIso:e.target.value})}/></td>
                          <td style={cellBg(okIso2)}><input type="number" step="0.1"  placeholder="–" style={{...S.inputSm,width:46,...inpBorder(okIso2)}} value={or.rIsoL2} onChange={e=>updOR(inst.id,outlet.id,{rIsoL2:e.target.value})}/></td>
                          <td style={cellBg(okIso3)}><input type="number" step="0.1"  placeholder="–" style={{...S.inputSm,width:46,...inpBorder(okIso3)}} value={or.rIsoL3} onChange={e=>updOR(inst.id,outlet.id,{rIsoL3:e.target.value})}/></td>
                          {hasRCD3ph&&<td style={isRCD?cellBg(okT1):{...S.td,background:"#0e1216"}}>{isRCD&&<input type="number" step="1" placeholder="–" style={{...S.inputSm,width:46,...inpBorder(okT1)}} value={or.rcdT1} onChange={e=>updOR(inst.id,outlet.id,{rcdT1:e.target.value})}/>}</td>}
                          {hasRCD3ph&&<td style={isRCD?S.td:{...S.td,background:"#0e1216"}}>{isRCD&&<input type="number" step="1" placeholder="–" style={{...S.inputSm,width:46}} value={or.rcdIan} onChange={e=>updOR(inst.id,outlet.id,{rcdIan:e.target.value})}/>}</td>}
                          <td style={{...S.td,textAlign:"center"}}><input type="checkbox" checked={or.ok||false} onChange={e=>updOR(inst.id,outlet.id,{ok:e.target.checked})}/></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
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
  nav:              {display:"flex",gap:4,padding:"0 18px",background:DARK,borderBottom:`1px solid ${LINE}`,flexWrap:"wrap"},
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
  inspPass:         {textAlign:"center",fontSize:15,fontWeight:700},
  dropdown:         {position:"fixed",background:"#1b2026",border:`1px solid ${LINE}`,borderRadius:6,padding:6,zIndex:9999,boxShadow:"0 8px 32px rgba(0,0,0,.7)"},
  dropdownList:     {maxHeight:320,overflowY:"auto"},
  dropdownItem:     {padding:"6px 8px",borderRadius:4,cursor:"pointer",fontSize:13,color:"#e8eaed"},
  dropdownItemActive:{background:ACCENT,color:"#1c2127",fontWeight:600},
};
const CSS=`*{box-sizing:border-box}body{margin:0}input:focus,select:focus{outline:2px solid ${ACCENT};outline-offset:-1px}button:hover{filter:brightness(1.1)}::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:${LINE};border-radius:4px}div[style*="cursor: pointer"]:hover,div[style*='cursor: pointer']:hover{filter:brightness(1.05)}`;
