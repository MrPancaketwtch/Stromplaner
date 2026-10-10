// Prüfprotokoll der Errichtungsprüfung als HTML mit A4-Seiten – gemeinsam für Desktop- und Handy-App.
// Der Desktop druckt es über Electron zu PDF, die Handy-App rendert die Seiten mit html2canvas/jsPDF.
// Inhalt wortgleich aus app/Stromplaner.jsx (exportInspectionPDF) übernommen – Änderungen am Protokoll nur hier.

const PHASES = ["L1","L2","L3"];
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

const is3ph        = (c) => (CONN[c]?.phases||1)===3;
const isMulticore  = (c) => !!CONN[c]?.isMulticore;
const round2       = (n) => Math.round((n+Number.EPSILON)*100)/100;
const alphaSort    = (arr,key) => [...arr].sort((a,b)=>(a[key]||"").localeCompare(b[key]||"","de",{numeric:true,sensitivity:"base"}));
const sortOutlets  = (outlets) => [...outlets].sort((a,b)=>{
  const as=a.connector==="SCHUKO"?0:1, bs=b.connector==="SCHUKO"?0:1;
  if(as!==bs) return as-bs;
  return a.label.localeCompare(b.label,"de",{numeric:true});
});
const calcVoltDrop = (I, l, A, cosPhi, threePhase) => {
  if(!+l||!+A||!+cosPhi) return null;
  const fac = threePhase ? Math.sqrt(3) : 2;
  const duV = fac * (+I) * (+l) * (+cosPhi) / (KAPPA_CU * (+A));
  return { V: round2(duV), pct: round2(duV / 230 * 100) };
};

const SICHT_ITEMS = [
  "Schaltgeräte",
  "Steckverbinder",
  "Leitungen",
  "Gehäuse",
  "Kennzeichnung",
  "Basisschutz",
];

// Abgang mit allen Feldern, die Prüfung und Protokoll erwarten (wie beim Laden in der Desktop-App)
export const migrateOutlet = (o, idx) => {
  const prot = (o.protection==="RCD") ? "Keine" : (o.protection || (o.connector==="SCHUKO"||o.connector==="MC" ? "RCBO" : "LS"));
  return {
    ...o,
    phase:      o.phase      || (is3ph(o.connector) ? "L1L2L3" : PHASES[idx%3]),
    breaker:    o.breaker    || "C",
    protection: prot,
    rcdId:      o.rcdId ?? null,
    rcdMa:      prot==="RCBO" ? (o.rcdMa ?? 30) : undefined,
    // Multicore: number of slots (default 6 if not set)
    mcSlots:    isMulticore(o.connector) ? (o.mcSlots||6) : undefined,
  };
};

/**
 * plan: Stromplaner-Plan (instances, boxTypes, loads, mainConns, placements, meta, inspMeta, inspResults)
 * logo, signatur: Data-URLs (optional)
 */
export function pruefprotokollHtml(plan, { logo = "", signatur = "" } = {}) {
  const instances   = plan.instances   || [];
  const placements  = plan.placements  || [];
  const mainConns   = plan.mainConns   || [];
  const meta        = plan.meta        || {};
  const inspMeta    = plan.inspMeta    || {};
  const inspResults = plan.inspResults || {};
  const byId = (arr) => { const m = {}; arr.forEach(x => m[x.id] = x); return m; };
  const boxTypeById  = byId((plan.boxTypes || []).map(bt => ({ ...bt, rcds: bt.rcds || [], outlets: (bt.outlets || []).map(migrateOutlet) })));
  const loadById     = byId(plan.loads || []);
  const instById     = byId(instances);
  const mainConnById = byId(mainConns);

  const IR_DEF = { voltL1N:"",voltL2N:"",voltL3N:"",voltL1L2:"",voltL2L3:"",voltL1L3:"",voltNPE:"",voltL1PE:"",voltL2PE:"",voltL3PE:"",phaseRot:"",rPE:"",rIso:"",zs:"",ik:"",sicht:[null,null,null,null,null,null],bemerkung:"",bemerkungSchwere:"bad",outlets:{} };
  const getIR = (iid) => { const sv=inspResults[iid]||{}; return {...IR_DEF,...sv,sicht:sv.sicht?[...sv.sicht]:[...IR_DEF.sicht],outlets:sv.outlets||{}}; };
  const OR_DEF = { rcdT1:"",rcdIan:"",ok:false,zs:"",ik:"",zsL1:"",zsL2:"",zsL3:"",ikL1:"",ikL2:"",ikL3:"",notInUse:false,zsOverride:"",ikOverride:"",zsOverrideL1:"",zsOverrideL2:"",zsOverrideL3:"",ikOverrideL1:"",ikOverrideL2:"",ikOverrideL3:"",overrideActive:false,cableLen:"",cableA:"",cosPhi:"0.95" };
  const getOR = (iid,oid) => ({...OR_DEF,...((getIR(iid).outlets||{})[oid]||{})});
  const worstZs = (...vs) => { const v=vs.filter(x=>x!=="").map(Number); return v.length ? Math.max(...v).toFixed(2) : ""; };
  const worstIk = (...vs) => { const v=vs.filter(x=>x!=="").map(Number); return v.length ? Math.min(...v).toFixed(0) : ""; };

  // Leitet Zs/Ik aus den Abgängen eines Unterverteilers ab – rekursiv über beliebig viele Ebenen
  const childDerived = (childInstIds) => {
    const zsVals=[], ikVals=[];
    childInstIds.forEach(cid=>{
      const cType=boxTypeById[instById[cid]?.typeId];
      (cType?.outlets||[]).forEach(co=>{
        if(isMulticore(co.connector)){
          // Multicore: jeden Slot einzeln prüfen – dort kann auch ein UV stecken
          for(let s=1;s<=(co.mcSlots||6);s++){
            const slotId=`${co.id}_s${s}`;
            const gcInsts=instances.filter(ci=>ci.parentId===cid&&ci.parentOutletId===slotId);
            if(gcInsts.length>0){
              const d=childDerived(gcInsts.map(ci=>ci.id));
              if(d.zs) zsVals.push(Number(d.zs));
              if(d.ik) ikVals.push(Number(d.ik));
            } else {
              const cor=getOR(cid,slotId);
              if(!cor.notInUse){
                if(cor.zs) zsVals.push(Number(cor.zs));
                if(cor.ik) ikVals.push(Number(cor.ik));
              }
            }
          }
        } else {
          const grandChildInsts=instances.filter(ci=>ci.parentId===cid&&ci.parentOutletId===co.id);
          if(grandChildInsts.length>0){
            // Outlet hat selbst einen Unterverteiler → rekursiv ableiten
            const d=childDerived(grandChildInsts.map(ci=>ci.id));
            if(d.zs) zsVals.push(Number(d.zs));
            if(d.ik) ikVals.push(Number(d.ik));
          } else {
            const collect=(cor)=>{
              if(cor.notInUse) return;
              if(is3ph(co.connector)){
                ["zsL1","zsL2","zsL3"].forEach(k=>{ if(cor[k]) zsVals.push(Number(cor[k])); });
                ["ikL1","ikL2","ikL3"].forEach(k=>{ if(cor[k]) ikVals.push(Number(cor[k])); });
              } else {
                if(cor.zs) zsVals.push(Number(cor.zs));
                if(cor.ik) ikVals.push(Number(cor.ik));
              }
            };
            collect(getOR(cid,co.id));
          }
        }
      });
    });
    return { zs: zsVals.length?Math.max(...zsVals).toFixed(2):"", ik: ikVals.length?Math.min(...ikVals).toFixed(0):"" };
  };

  const _cl = logo;
  const _sig = signatur;


    const esc=(s)=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const pdfChk=(val,lo,hi)=>{if(val===""||val===undefined||val===null)return"";const n=parseFloat(val);if(isNaN(n))return"";if(lo!==undefined&&n<lo)return"bad";if(hi!==undefined&&n>hi)return"bad";return"ok";};
    const pdfChkAll=(vals,lo,hi)=>{const vs=vals.filter(v=>v!=="");if(!vs.length)return"";return vs.some(v=>pdfChk(v,lo,hi)==="bad")?"bad":"ok";};
    const badge=(r)=>r==="ok"?`<span class="ok">✓ ok</span>`:r==="bad"?`<span class="bad">✕ Mangel</span>`:`<span class="muted">–</span>`;
    const sichtBadge=(v)=>v===true?`<span class="ok">✓ ok</span>`:`<span class="muted">–</span>`;
    const fv=(...vals)=>vals.filter(v=>v!=="").map(v=>esc(v)+"&thinsp;V").join(" / ")||"–";

    const css=`:root{--ep-accent:#f5a623;--ep-dark:#1c2127;--ep-ink:#1c2127;--ep-ink2:#4a5159;--ep-ink3:#7a8290;--ep-rule:#c8ccd1;--ep-rule2:#e6e9ec;--ep-band:#f3f4f6;--ep-paper:#ffffff;--ep-ok:#1c7a3e;--ep-bad:#b91c1c;--ep-warn:#8a5500;--ep-badrow:#fcf2f2;--ep-warnrow:#fdf7e6;--ep-font:'Segoe UI',system-ui,-apple-system,sans-serif;--ep-pad-x:44px;--ep-row-pad:4px 10px;--ep-gap-y:10px}
html,body{margin:0;padding:0;background:#2a2724;font-family:var(--ep-font)}*{box-sizing:border-box}
.ep-stage{min-height:100vh;padding:28px 0 80px;display:flex;flex-direction:column;align-items:center;gap:18px}
.page{width:794px;min-height:1123px;background:var(--ep-paper);color:var(--ep-ink);font-size:9.5px;line-height:1.45;font-variant-numeric:tabular-nums;display:flex;flex-direction:column;box-shadow:0 1px 0 rgba(0,0,0,.05),0 18px 40px -22px rgba(0,0,0,.4)}
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
@media print{html,body,.ep-stage{background:#fff;padding:0;gap:0}.page{box-shadow:none;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}}@page{size:A4 portrait;margin:0}`;

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
    const subR=`${esc(meta?.production||"Planung")} · ${esc(inspMeta.date||"")}`;
    const ftrL=esc(inspMeta.inspector||"–");
    const ftrC=`EP-${(meta?.production||"Plan").replace(/[^A-Za-z0-9]/g,"-").slice(0,30)}`;
    const _logoHtml=_cl?`<img src="${_cl}" style="height:20px;max-width:90px;object-fit:contain;vertical-align:middle">` : "";
    const pageH=_logoHtml
      ? `<header class="page-h"><span>${hdr}</span><span style="display:flex;align-items:center;gap:8px"><span>${subR}</span>${_logoHtml}</span></header>`
      : `<header class="page-h"><span>${hdr}</span><span>${subR}</span></header>`;

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
  ${pageH}
  <main class="page-body">
    <div class="page-title"><div class="kicker">Errichtungsprüfung · DIN VDE 0100-600 · mobile Stromverteilung</div>
      <h1>${esc(meta?.production||"Planung")}<span class="muted"> · ${esc(inspMeta.address||inspMeta.location||"")}</span></h1></div>
    <section class="block"><header class="bar"><span><strong>Produktion</strong></span><span class="bar-right">${esc(inspMeta.date||"")}</span></header>
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
    <section class="block"><header class="bar"><span><strong>Umfang</strong><span class="bar-sub">${total} Verteiler</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:1.6fr 1fr 1.1fr 1.1fr"><span>Bezeichnung</span><span>Typ</span><span>Eingang</span><span>Hängt an</span></div>
        ${sorted2.map((inst,i)=>{const type=boxTypeById[inst.typeId];const parent=inst.parentId?instById[inst.parentId]:null;const feedLbl=parent?esc(parent.name):inst.mainConnectionId?esc(mainConnById[inst.mainConnectionId]?.name||"–"):"— Einspeisung —";return`<div class="trow${i===sorted2.length-1?" row-last":""}" style="grid-template-columns:1.6fr 1fr 1.1fr 1.1fr"><span><strong>${esc(inst.name)}</strong></span><span class="muted">${esc(type?.name||"–")}</span><span class="muted">${CONN[type?.feedConnector]?.label||""} ${type?.feedAmp||""}A</span><span class="muted">${feedLbl}</span></div>`;}).join("")}
      </div></section>
    <div class="spacer-auto"></div>
  </main>
  <footer class="page-f"><span>${ftrL}</span><span>${ftrC}</span><span>Seite 01 / PTOT</span></footer>
</article>`;

    // ── Pro Verteiler ────────────────────────────────────────────────────────
    // Seitenzähler: Deckblatt = 1, Verteilerseiten ab 2, Abschluss zuletzt
    let pdfPC=1;
    sorted2.forEach((inst,instIdx)=>{
      const type=boxTypeById[inst.typeId];
      const outlets=type?sortOutlets(type.outlets):[];
      const ir=getIR(inst.id);
      const sicht=ir.sicht||Array(6).fill(null);
      // RCCB-Gruppen + RCBO im PDF
      const pdfRcdRows=[];
      (type?.rcds||[]).forEach(rcd=>pdfRcdRows.push({rowType:"rcd",rcd,outlet:null,oid:`rcd_${rcd.id}`,rowLabel:rcd.label,iAnLimit:rcd.mA,protLabel:`RCD ${rcd.mA} mA`}));
      outlets.filter(o=>o.protection==="RCBO").forEach(o=>{
        const rMa=o.rcdMa??30;
        if(isMulticore(o.connector)){const slots=o.mcSlots||6;for(let s=1;s<=slots;s++)pdfRcdRows.push({rowType:"rcbo",rcd:null,outlet:o,oid:`${o.id}_s${s}`,rowLabel:`${o.label} – SP ${s} (${PHASES[(s-1)%3]})`,iAnLimit:rMa,protLabel:`RCBO ${o.amp}A / ${rMa}mA`});}
        else pdfRcdRows.push({rowType:"rcbo",rcd:null,outlet:o,oid:o.id,rowLabel:o.label,iAnLimit:rMa,protLabel:`RCBO ${o.amp}A / ${rMa}mA`});
      });
      const parent=inst.parentId?instById[inst.parentId]:null;
      const n=instIdx+1;
      const hasMangel=!!(ir.bemerkung&&(ir.bemerkungSchwere||"bad")==="bad");
      const hasHinweis=!!(ir.bemerkung&&ir.bemerkungSchwere==="warn");
      const phaseR=ir.phaseRot==="rechts"?"ok":ir.phaseRot==="links"?"bad":"";
      const ckVLN=pdfChkAll([ir.voltL1N,ir.voltL2N,ir.voltL3N],207,244);
      const ckVLL=pdfChkAll([ir.voltL1L2,ir.voltL2L3,ir.voltL1L3],360,424);
      const ckVNPE=pdfChk(ir.voltNPE,undefined,1);
      const ckVLPE=pdfChkAll([ir.voltL1PE,ir.voltL2PE,ir.voltL3PE],207,244);
      const hasInletMeas=!!(ir.zs||ir.ik);
      let secIdx=4;
      const rcdSec=pdfRcdRows.length?secIdx++:0;
      const abgSec=secIdx++;
      const cableRows=outlets.filter(o=>getOR(inst.id,o.id).cableLen!=="");
      const cableSec=cableRows.length?secIdx++:0;
      const bemSec=ir.bemerkung?secIdx:0;

      // ── abgRows frühzeitig aufbauen (für Page-Split) ─────────────────────
      const abgRows=[];
      outlets.forEach(o=>{
        if(isMulticore(o.connector)){
          const slots=o.mcSlots||6;
          for(let s=1;s<=slots;s++){
            const oid=`${o.id}_s${s}`;
            const pl=(placements||[]).filter(p=>p.instanceId===inst.id&&p.outletId===o.id&&p.mcSlot===s);
            const lbl=pl.length?(loadById||{})[pl[0].loadId]?.name||"–":"–";
            abgRows.push({oid,label:`${o.label} SP${s}`,lbl,amp:o.amp||16,is3p:false,hasChild:false,hasRcd:o.protection==="RCBO"||!!o.rcdId,breaker:o.breaker||"C"});
          }
        } else {
          const childInsts=instances.filter(ci=>ci.parentId===inst.id&&ci.parentOutletId===o.id);
          const pl=(placements||[]).filter(p=>p.instanceId===inst.id&&p.outletId===o.id);
          const lbl=childInsts.length?childInsts[0].name:(pl.length?(loadById||{})[pl[0].loadId]?.name||"–":"–");
          abgRows.push({oid:o.id,label:o.label,lbl,amp:o.amp||type?.feedAmp||16,is3p:is3ph(o.connector),hasChild:childInsts.length>0,childInstIds:childInsts.map(ci=>ci.id),hasRcd:o.protection==="RCBO"||!!o.rcdId,breaker:o.breaker||"C"});
        }
      });

      // ── Page-Split: Zeilen schätzen die auf erste/Folge-Seite passen ─────
      // Gemessene Konstanten (px): Fixsektionen (Titel+Stamm+Sicht+Mess)=420,
      // Sektions-Overhead (Bar+Thead+Margin)=72, Zeile=30 (inkl. Phasen-Subzeile),
      // Fortsetzungs-Titel=50
      const _rcdH=pdfRcdRows.length?72+pdfRcdRows.length*30:0;
      const _rowsFst=Math.max(4,Math.floor((1018-420-_rcdH-72)/30));
      const _rowsCnt=Math.max(4,Math.floor((1018-50-72)/30));
      const _chunks=[];const _todo=[...abgRows];
      _chunks.push(_todo.splice(0,_rowsFst));
      while(_todo.length)_chunks.push(_todo.splice(0,_rowsCnt));

      // ── ABG-Chunk-Renderer ───────────────────────────────────────────────
      const pdfWorstZs=(...vs)=>{const v=vs.filter(x=>x!=="").map(Number);return v.length?Math.max(...v).toFixed(2):"";};
      const pdfWorstIk=(...vs)=>{const v=vs.filter(x=>x!=="").map(Number);return v.length?Math.min(...v).toFixed(0):"";};
      const renderChunk=(chunk,isLastChunk)=>`<section class="block"><header class="bar"><span><strong>${n}.${abgSec} · Abgänge &amp; Schleifenimpedanz</strong><span class="bar-sub">${abgRows.length} Stk.</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:80px 1fr 90px 100px 55px"><span>Anschl.</span><span>Verbraucher / Verteiler</span><span class="r">Z_s (Ω)</span><span class="r">I_k (A)<br><span style="font-weight:400;font-size:8px">≥ In×10 A</span></span><span class="r">Befund</span></div>
        ${chunk.map(({oid,label,lbl,amp,is3p,hasChild,childInstIds,hasRcd,breaker},i)=>{
          const or=getOR(inst.id,oid);
          const ikFactorO=breaker==="B"?5:breaker==="D"?20:breaker==="K"?14:10;
          const ikLimO=amp*ikFactorO;
          const zsLimO=hasRcd?2.0:parseFloat((230/(amp*ikFactorO)).toFixed(2));
          const last=(i===chunk.length-1&&isLastChunk)?" row-last":"";
          if(or.notInUse) return `<div class="trow${last}" style="grid-template-columns:80px 1fr 90px 100px 55px;opacity:0.55"><span class="id">${esc(label)}</span><span class="ell muted" style="font-style:italic">Nicht in Betrieb</span><span class="r muted">–</span><span class="r muted">–</span><span class="r muted">—</span></div>`;
          if(hasChild){
            const d=childDerived(childInstIds||[]);
            const hasOv=or.overrideActive||!!(or.zsOverride||or.ikOverride||or.zsOverrideL1||or.zsOverrideL2||or.zsOverrideL3||or.ikOverrideL1||or.ikOverrideL2||or.ikOverrideL3);
            const zsVal=(hasOv?(is3p?worstZs(or.zsOverrideL1,or.zsOverrideL2,or.zsOverrideL3)||or.zsOverride:or.zsOverride)||d.zs:d.zs)||"";
            const ikVal=(hasOv?(is3p?worstIk(or.ikOverrideL1,or.ikOverrideL2,or.ikOverrideL3)||or.ikOverride:or.ikOverride)||d.ik:d.ik)||"";
            const ckZs=zsVal?pdfChk(zsVal,undefined,zsLimO):"";
            const ckIk=ikVal?pdfChk(ikVal,ikLimO,undefined):"";
            const ck=ckIk==="bad"||ckZs==="bad"?"bad":ckIk==="ok"||ckZs==="ok"?"ok":"";
            const uvNote=`<span style="font-size:8px;color:#888"> (UV)</span>`;
            const ovMark=hasOv?`<span style="font-size:8px;color:#e67e22"> ✎</span>`:"";
            const lblTxt=hasOv
              ? `Separat gemessen am Eingang – abgel. Wert (${d.zs||"–"} Ω / ${d.ik||"–"} A) überschritt Grenzwert (DIN VDE 0100-600 §643)`
              : `Messung aus angeschlossener Unterverteilung (ungünstigster Punkt, DIN VDE 0100-600 §643)`;
            return `<div class="trow${last}" style="grid-template-columns:80px 1fr 90px 100px 55px"><span class="id">${esc(label)}</span><span class="muted" style="font-style:italic;min-width:0">${lblTxt}</span><span class="r">${zsVal?esc(zsVal)+" &Omega;"+(hasOv?ovMark:uvNote):"–"}</span><span class="r"><strong>${ikVal?esc(ikVal)+" A"+(hasOv?"":uvNote):"–"}</strong>${ikVal?`<br><span class="muted" style="font-size:8px">≥ ${ikLimO} A</span>`:""}</span><span class="r">${ck?badge(ck):"—"}</span></div>`;
          }
          const zsVal=is3p?pdfWorstZs(or.zsL1,or.zsL2,or.zsL3):(or.zs||"");
          const ikVal=is3p?pdfWorstIk(or.ikL1,or.ikL2,or.ikL3):(or.ik||"");
          const zsNote=is3p&&zsVal?`<br><span style="font-size:8px;color:#888">${[or.zsL1,or.zsL2,or.zsL3].filter(x=>x).join(" / ")} Ω</span>`:"";
          const ikNote=is3p&&ikVal?`<br><span style="font-size:8px;color:#888">${[or.ikL1,or.ikL2,or.ikL3].filter(x=>x).join(" / ")} A</span>`:``;
          const ckZsO=pdfChk(zsVal,undefined,zsLimO);
          const ckIkO=pdfChk(ikVal,ikLimO,undefined);
          const ckO=ckIkO==="bad"||ckZsO==="bad"?"bad":ckIkO==="ok"||ckZsO==="ok"?"ok":"";
          return `<div class="trow${last}" style="grid-template-columns:80px 1fr 90px 100px 55px"><span class="id">${esc(label)}</span><span style="min-width:0">${esc(lbl)}</span><span class="r">${zsVal?esc(zsVal)+" Ω"+zsNote:"–"}</span><span class="r"><strong>${ikVal?esc(ikVal)+" A"+ikNote:"–"}</strong>${ikVal?`<br><span class="muted" style="font-size:8px">≥ ${ikLimO} A</span>`:""}</span><span class="r">${badge(ckO)}</span></div>`;
        }).join("")}
      </div></section>`;

      // ── Kabel + Bemerkung als HTML-Strings ───────────────────────────────
      const cableHTML=cableRows.length?`<section class="block"><header class="bar"><span><strong>${n}.${cableSec} · Leitungen &amp; Spannungsfall</strong><span class="bar-sub">${cableRows.length} Stk.</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:1fr 55px 65px 65px 65px 65px 55px"><span>Abgang</span><span class="r">I_N</span><span class="r">&ell; (m)</span><span class="r">A (mm&sup2;)</span><span class="r">&Delta;U (V)</span><span class="r">&Delta;U (%)</span><span class="r">Befund</span></div>
        ${cableRows.map((o,i)=>{const or=getOR(inst.id,o.id);const du=calcVoltDrop(o.amp,or.cableLen,or.cableA,or.cosPhi,is3ph(o.connector));const befund=du?(du.pct<=3?"ok":du.pct<=5?"warn":"bad"):"";return`<div class="trow${i===cableRows.length-1?" row-last":""}" style="grid-template-columns:1fr 55px 65px 65px 65px 65px 55px"><span class="id">${esc(o.label)}</span><span class="r muted">${o.amp}A</span><span class="r">${esc(or.cableLen)||"–"}&thinsp;m</span><span class="r">${esc(or.cableA)||"–"}&thinsp;mm&sup2;</span><span class="r">${du?du.V.toFixed(2)+"&thinsp;V":"–"}</span><span class="r${du&&du.pct>5?" bad":du&&du.pct>3?" warn":""}"><strong>${du?du.pct.toFixed(2)+"&thinsp;%":"–"}</strong></span><span class="r">${badge(befund)}</span></div>`;}).join("")}
      </div></section>`:"";
      const bemHTML=ir.bemerkung?`<section class="block"><header class="bar"><span><strong>${n}.${bemSec} · Bemerkung</strong></span><span class="bar-right">${(ir.bemerkungSchwere||"bad")==="warn"?`<span class="warn">! Hinweis</span>`:`<span class="bad">✕ Mangel</span>`}</span></header>
      <div class="block-body"><div class="bemerkung${(ir.bemerkungSchwere||"bad")==="warn"?"":" row-bad"}">${esc(ir.bemerkung)}</div></div></section>`:"";

      // ── Seiten rendern (eine pro Chunk) ──────────────────────────────────
      _chunks.forEach((chunk,ci)=>{
        pdfPC++;
        const pNum=String(pdfPC).padStart(2,"0");
        const isFirst=ci===0;
        const isLast=ci===_chunks.length-1;
        if(isFirst){
          pages+=`<article class="page">
  ${pageH}
  <main class="page-body">
    <div class="page-title"><div class="page-title-row">
      <div><div class="kicker">Verteiler ${n} von ${total} · ${esc(type?.name||"")}</div>
        <h1><span class="id-h1">${esc(inst.name)}</span><span class="muted muted-h1"> · ${CONN[type?.feedConnector]?.label||""} ${type?.feedAmp||""}A · ${esc(type?.name||"")}</span></h1></div>
      ${hasMangel?`<span class="befund-label bad">✕ Mangel</span>`:hasHinweis?`<span class="befund-label warn">! Hinweis</span>`:""}
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
        <div class="trow${!hasInletMeas?" row-last":""}" style="grid-template-columns:1fr 210px 130px 80px"><span><span class="muted no">${n}.3.5</span>U L–PE (L1 / L2 / L3)</span><span class="r"><strong>${fv(ir.voltL1PE,ir.voltL2PE,ir.voltL3PE)}</strong></span><span class="r muted">207–244 V</span><span class="r">${badge(ckVLPE)}</span></div>
        ${hasInletMeas?`<div class="trow${!ir.ik?" row-last":""}" style="grid-template-columns:1fr 210px 130px 80px"><span><span class="muted no">${n}.3.6</span>Z_s Eingang</span><span class="r"><strong>${ir.zs?esc(ir.zs)+"&thinsp;Ω":"–"}</strong></span><span class="r muted">–</span><span class="r"><span class="muted">–</span></span></div>${ir.ik?`<div class="trow row-last" style="grid-template-columns:1fr 210px 130px 80px"><span><span class="muted no">${n}.3.7</span>I_k Eingang</span><span class="r"><strong>${esc(ir.ik)}&thinsp;A</strong></span><span class="r muted">–</span><span class="r"><span class="muted">–</span></span></div>`:""}`:""}

      </div></section>
    ${pdfRcdRows.length?`<section class="block"><header class="bar"><span><strong>${n}.${rcdSec} · RCD-Prüfung</strong><span class="bar-sub">${pdfRcdRows.length} Stk.</span></span></header>
      <div class="block-body">
        <div class="thead" style="grid-template-columns:1fr 80px 100px 90px"><span>Anschluss / RCD</span><span>Typ</span><span class="r">I_An (mA)<br><span style="font-weight:400;font-size:8px">½N – N</span></span><span class="r">t_A (ms)<br><span style="font-weight:400;font-size:8px">&le; 300 ms</span></span></div>
        ${pdfRcdRows.map(({rowType,rcd,outlet,oid,rowLabel,iAnLimit,protLabel},i)=>{const or=getOR(inst.id,oid);const okT=pdfChk(or.rcdT1,undefined,300);const okIan=iAnLimit?pdfChk(or.rcdIan,iAnLimit/2,iAnLimit):"";const bgStyle=rowType==="rcd"?"background:rgba(245,166,35,0.04);":"";return`<div class="trow${i===pdfRcdRows.length-1?" row-last":""}" style="${bgStyle}grid-template-columns:1fr 80px 100px 90px"><span><span class="id">${esc(rowLabel)}</span></span><span class="muted">${esc(protLabel)}</span><span class="r${okIan==="bad"?" bad":""}"><strong>${esc(or.rcdIan)||"–"}</strong>${iAnLimit?`<br><span class="muted" style="font-size:8px">${iAnLimit/2}–${iAnLimit}&thinsp;mA</span>`:""}</span><span class="r${okT==="bad"?" bad":""}"><strong>${esc(or.rcdT1)||"–"}</strong></span></div>`;}).join("")}
      </div></section>`:""}
    ${renderChunk(chunk,isLast)}
    ${isLast?cableHTML:""}
    ${isLast?bemHTML:""}
  </main>
  <footer class="page-f"><span>${ftrL}</span><span>${ftrC}</span><span>Seite ${pNum} / PTOT</span></footer>
</article>`;
        } else {
          pages+=`<article class="page">
  ${pageH}
  <main class="page-body">
    <div style="margin:4px 0 8px"><div class="kicker">${esc(inst.name)} · Verteiler ${n} von ${total} – Fortsetzung</div></div>
    ${renderChunk(chunk,isLast)}
    ${isLast?cableHTML:""}
    ${isLast?bemHTML:""}
  </main>
  <footer class="page-f"><span>${ftrL}</span><span>${ftrC}</span><span>Seite ${pNum} / PTOT</span></footer>
</article>`;
        }
      });
    });

    // ── Abschluss ────────────────────────────────────────────────────────
    pdfPC++;
    const lastNum=String(pdfPC).padStart(2,"0");
    pages+=`<article class="page">
  ${pageH}
  <main class="page-body">
    <div class="page-title"><div class="kicker">Abschluss · Mängelliste · Bestätigung</div><h1>Befund &amp; Unterschrift</h1></div>
    <section class="block"><header class="bar"><span><strong>E · Mängel und Auflagen</strong><span class="bar-sub">${maengel.length} Eintr${maengel.length===1?"ag":"äge"}</span></span></header>
      <div class="block-body">${maengel.length===0?`<div style="padding:6px 10px;color:#7a8290;font-size:9.5px">Keine Mängel protokolliert.</div>`:`
        <div class="thead" style="grid-template-columns:40px 200px 1fr 80px"><span>Nr.</span><span>Verteiler</span><span>Beschreibung</span><span class="r">Schwere</span></div>
        ${maengel.map((m,i)=>`<div class="trow${i===maengel.length-1?" row-last":""}" style="grid-template-columns:40px 200px 1fr 80px"><span class="muted">M${String(i+1).padStart(2,"0")}</span><span>${esc(m.inst.name)}</span><span>${esc(m.item)}</span><span class="r">${m.type==="bad"?`<span class="bad">✕ Mangel</span>`:`<span class="warn">! Hinweis</span>`}</span></div>`).join("")}`}
      </div></section>
    <section class="block"><header class="bar"><span><strong>F · Unterschrift</strong><span class="bar-sub">Prüfende Elektrofachkraft</span></span></header>
      <div class="block-body">
        <div class="sign" style="padding:12px 12px 8px"><div class="sign-role">Prüfende Elektrofachkraft · DIN VDE 0100-600</div>${_sig?`<img src="${_sig.replace(/"/g,'&quot;')}" style="height:48px;max-width:200px;object-fit:contain;display:block;margin-bottom:4px">`:`<div class="sign-line"></div>`}<div class="sign-name">${esc(inspMeta.inspector||"–")}</div><div class="muted">${esc(inspMeta.location||"")}${inspMeta.date?" · "+esc(inspMeta.date):""}</div></div>
      </div></section>
    <div class="spacer-auto"></div>
    <section class="block"><header class="bar"><span><strong>Hinweis</strong></span></header>
      <div class="block-body"><div class="bemerkung small">Dieses Protokoll ist im Zuge der Veranstaltung mitzuführen und bei der prüfenden Elektrofachkraft zu archivieren. Bei Erweiterung oder Umbau der Anlage ist eine erneute Prüfung der betroffenen Anlagenteile gemäß DIN VDE 0100-600 erforderlich.</div></div></section>
  </main>
  <footer class="page-f"><span>${ftrL}</span><span>${ftrC}</span><span>Seite ${lastNum} / PTOT</span></footer>
</article>`;
    // Platzhalter durch tatsächliche Gesamtseitenzahl ersetzen
    pages=pages.replace(/PTOT/g,String(pdfPC));

    const fullHtml=`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Errichtungspruefung</title><style>${css}</style></head><body><div class="ep-stage">${pages}</div></body></html>`;
  return fullHtml;
}
