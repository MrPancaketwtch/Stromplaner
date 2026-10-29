// Stromplan als druckbares HTML (Einspeisepunkte, Verteiler mit Steckungen, Leitungsdimensionierung,
// Spannungsfall) – gemeinsam für Desktop- und Handy-App. Inhalt wortgleich aus app/Stromplaner.jsx (exportPDF).
// Das Blockschaltbild liefert der Desktop als fertiges SVG; die Handy-App hat keine Schaltbild-Ansicht.

const PHASES = ["L1","L2","L3"];
const VOLT   = 230;
const CONN = {
  CEE16:   { label:"16A 3LNPE 400V",  amp:16,  phases:3 },
  CEE32:   { label:"32A 3LNPE 400V",  amp:32,  phases:3 },
  CEE63:   { label:"63A 3LNPE 400V",  amp:63,  phases:3 },
  CEE125:  { label:"125A 3LNPE 400V", amp:125, phases:3 },
  CEE16_1: { label:"16A 1LNPE 230V",  amp:16,  phases:1 },
  CEE32_1: { label:"32A 1LNPE 230V",  amp:32,  phases:1 },
  PL200:   { label:"200A Powerlock",  amp:200, phases:3 },
  PL400:   { label:"400A Powerlock",  amp:400, phases:3 },
  PL660:   { label:"660A Powerlock",  amp:660, phases:3 },
  PL1000:  { label:"1000A Powerlock", amp:1000,phases:3 },
  MC:      { label:"Multicore",       amp:16,  phases:1, isMulticore:true },
  SCHUKO:  { label:"Schuko",          amp:16,  phases:1 },
};
const KAPPA_CU     = 56;   // m/(Ω·mm²), Kupfer 20 °C
const I_CAP_H07 = {1.5:23,2.5:30,4:38,6:48,10:64,16:84,25:109,35:135,50:162,70:202,95:245};
const F_TEMP = {10:1.22,15:1.17,20:1.12,25:1.06,30:1.00,35:0.94,40:0.87,45:0.79,50:0.71};
const F_ADERN = {2:1.00,3:0.70,4:0.65,5:0.60,6:0.57};
const F_LAGEN = {1:0.85,2:0.65,3:0.45};
const F_HAE_EINL   = {1:1.00,2:0.85,3:0.79,4:0.75,5:0.73,6:0.72,7:0.72,8:0.71,9:0.70,10:0.70};
const F_HAE_GEBUND = {1:1.00,2:0.80,3:0.75,4:0.70,5:0.68,6:0.65,7:0.65,8:0.62,9:0.62,10:0.60};
const isMulticore  = (c) => !!CONN[c]?.isMulticore;
const round2       = (n) => Math.round((n+Number.EPSILON)*100)/100;
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

/**
 * plan: Stromplaner-Plan (meta, mainConns, boxTypes, loads, instances, placements, cableCalcs, voltCalcs)
 * logo: Data-URL des Firmenlogos, schaltbildSvg: fertig umgefärbtes Blockschaltbild (optional)
 */
export function stromplanHtml(plan, { logo = "", schaltbildSvg = "" } = {}) {
  const meta       = plan.meta       || {};
  const mainConns  = plan.mainConns  || [];
  const instances  = plan.instances  || [];
  const placements = plan.placements || [];
  const cableCalcs = plan.cableCalcs || [];
  const voltCalcs  = plan.voltCalcs  || [];
  const corpLogo   = logo;
  const byId = (arr) => { const m = {}; arr.forEach(x => m[x.id] = x); return m; };
  const boxTypeById  = byId(plan.boxTypes || []);
  const loadById     = byId(plan.loads || []);
  const instById     = byId(instances);
  const mainConnById = byId(mainConns);

  const placementAmps = (p)=>{
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
  };
  const ownLoad = (instanceId)=>{
    const r={L1:0,L2:0,L3:0};
    placements.filter(p=>p.instanceId===instanceId&&p.loadId).forEach(p=>{
      const a=placementAmps(p); r.L1+=a.L1; r.L2+=a.L2; r.L3+=a.L3;
    });
    return r;
  };
  const totalLoad = (instanceId,visited=new Set())=>{
    if(visited.has(instanceId)) return {L1:0,L2:0,L3:0};
    visited.add(instanceId);
    const r=ownLoad(instanceId);
    instances.filter(c=>c.parentId===instanceId).forEach(child=>{
      const ch=totalLoad(child.id,visited); r.L1+=ch.L1; r.L2+=ch.L2; r.L3+=ch.L3;
    });
    return r;
  };
  const rootInstances = instances.filter(i=>!i.parentId);

    const phBar=(vals,maxA)=>PHASES.map(ph=>{
      const a=round2(vals[ph]); const pct=maxA?Math.round((a/maxA)*100):0;
      const col=pct>100?"#c0392b":pct>80?"#e67e22":"#27ae60";
      return `<div style="flex:1;text-align:center;padding:4px 8px;background:#f8f8f8;border:1px solid #ddd;border-radius:4px">
        <div style="font-weight:700;font-size:11px">${ph}</div>
        <div style="font-size:16px;font-weight:800;color:${col}">${a} A</div>
        <div style="height:5px;background:#eee;border-radius:3px;margin:3px 0"><div style="height:100%;width:${Math.min(pct,100)}%;background:${col};border-radius:3px"></div></div>
        <div style="font-size:9px;color:#666">${maxA?pct+"% von "+maxA+"A":""}</div></div>`;
    }).join("");
    let body=`${corpLogo?`<div style="text-align:right;margin-bottom:12px"><img src="${corpLogo.replace(/"/g,'&quot;')}" style="max-height:40px;max-width:140px;object-fit:contain"></div>`:""}<h1 style="font-size:18px;margin:0 0 4px;display:flex;align-items:center;gap:6px"><svg width="18" height="18" viewBox="0 0 24 24" fill="#f5a623" stroke="#b05a00" stroke-width="1.5" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>STROMPLAN</h1>
      <div style="font-size:12px;color:#555;margin-bottom:16px">${meta.production} · ${meta.creator} · v${meta.version} · ${meta.date}</div>`;
    if(mainConns.length){
      body+=`<h2 style="font-size:13px;background:#1c2127;color:#fff;padding:6px 10px;margin:0 0 8px;border-radius:4px">Einspeisepunkte</h2>`;
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

    if(schaltbildSvg){
      body+=`<div style="page-break-before:always">
        <h2 style="font-size:13px;background:#2d3748;color:#fff;padding:6px 10px;margin:0 0 12px;border-radius:4px">Blockschaltbild</h2>
        ${schaltbildSvg}</div>`;
    }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stromplan – ${meta.production}</title>
      <style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#222;margin:0}</style>
      </head><body>${body}</body></html>`;
}
