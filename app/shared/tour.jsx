// Geführte Tour und Willkommensfrage – gemeinsam für Desktop- und Handy-App.
// Ein Schritt: { id?, ziel?: CSS-Selektor, titel, text?, vorher?: (aktion) => void }
// Ohne Ziel erscheint die Karte mittig – auch wenn es das Ziel gerade nicht gibt (z. B. noch keine Verteiler),
// damit kein Schritt verloren geht.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

const F = { akzent: "#f5a623", karte: "#1e2530", rand: "#2e3a4a", text: "#e8eaf0", leise: "#9aa4af", grund: "#15191e" };
const RAND = 8;          // Abstand der Markierung um das Ziel
const SCHLEIER = "rgba(8,10,14,0.82)";

const CSS = `
@keyframes tourPuls{0%{box-shadow:0 0 0 0 rgba(245,166,35,.6)}70%{box-shadow:0 0 0 14px rgba(245,166,35,0)}100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}}
@keyframes tourTipp{0%{transform:translate(-50%,-50%) scale(.35);opacity:.95}75%{transform:translate(-50%,-50%) scale(1.7);opacity:0}100%{transform:translate(-50%,-50%) scale(1.7);opacity:0}}
@keyframes tourEin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
`;

export const TUTORIAL_KEY = "sp_tutorial_gefragt";
export const tutorialGefragt = () => { try { return localStorage.getItem(TUTORIAL_KEY) === "1"; } catch { return true; } };
export const tutorialMerken = () => { try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch { /* nur Komfort */ } };

const sichtbar = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const findeZiel = (sel) => [...document.querySelectorAll(sel)].find(sichtbar) || null;

// Nach einem Tab-Wechsel erscheint das Ziel erst mit dem nächsten Rendern.
// Timer statt requestAnimationFrame: der ruht, solange das Fenster verdeckt ist.
const warteAufZiel = (sel, ms = 700) => new Promise((ok) => {
  const start = Date.now();
  const schau = () => { const el = findeZiel(sel); if (el || Date.now() - start > ms) ok(el); else setTimeout(schau, 40); };
  schau();
});

// Auf den sichtbaren Bereich begrenzen (große Abschnitte ragen über den Bildschirm hinaus)
const begrenzt = (r) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const top = Math.max(r.top, 6), left = Math.max(r.left, 6);
  return { top, left, width: Math.min(r.right, vw - 6) - left, height: Math.min(r.bottom, vh - 6) - top };
};
const gleich = (a, b) => a && b && ["top", "left", "width", "height"].every(k => Math.abs(a[k] - b[k]) < 1);

// hinweis: kurzer Text oben am Rand, z. B. wenn gerade ein Beispielplan gezeigt wird
export function Tour({ schritte, aktion, onEnde, start = 0, hinweis = null }) {
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), schritte.length - 1));
  const [rahmen, setRahmen] = useState(null);   // Rahmen des Ziels, null = Karte mittig
  const [bereit, setBereit] = useState(false);
  const [karte, setKarte] = useState({ h: 170 });
  const ziel = useRef(null);
  const karteRef = useRef(null);
  const ende = useRef(onEnde); ende.current = onEnde;
  const s = schritte[index];
  const letzter = index === schritte.length - 1;

  // Schritt vorbereiten: Ansicht wechseln, Ziel suchen, hinscrollen
  useEffect(() => {
    let abbruch = false;
    setBereit(false);
    (async () => {
      try { s.vorher?.(aktion); } catch { /* Ansicht ließ sich nicht wechseln – Ziel fehlt dann einfach */ }
      const el = s.ziel ? await warteAufZiel(s.ziel) : null;
      if (abbruch) return;
      ziel.current = el;
      if (el) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        await new Promise(r => setTimeout(r, 380));
        if (abbruch) return;
      }
      setRahmen(el ? begrenzt(el.getBoundingClientRect()) : null);
      setBereit(true);
    })();
    return () => { abbruch = true; };
  }, [index]);

  // Ziel verschiebt sich (Scrollen, Fenstergröße) – Markierung folgt
  useEffect(() => {
    if (!bereit || !ziel.current) return;
    const t = setInterval(() => {
      if (!ziel.current?.isConnected) return;
      const r = begrenzt(ziel.current.getBoundingClientRect());
      setRahmen(alt => gleich(alt, r) ? alt : r);
    }, 200);
    return () => clearInterval(t);
  }, [bereit, index]);

  useLayoutEffect(() => {
    const h = karteRef.current?.offsetHeight;
    if (h && Math.abs(h - karte.h) > 2) setKarte({ h });
  });

  const weiter = () => { if (letzter) ende.current(); else setIndex(i => i + 1); };
  const zurueck = () => { if (index > 0) setIndex(i => i - 1); };

  useEffect(() => {
    const taste = (e) => {
      if (e.key === "Escape") { e.preventDefault(); ende.current(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); weiter(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); zurueck(); }
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  });

  const vw = window.innerWidth, vh = window.innerHeight;
  const breite = Math.min(340, vw - 24);
  let top, left;
  if (!rahmen) {
    top = Math.max(12, (vh - karte.h) / 2);
    left = (vw - breite) / 2;
  } else {
    const unten = vh - (rahmen.top + rahmen.height + RAND), oben = rahmen.top - RAND;
    top = unten >= karte.h + 24 ? rahmen.top + rahmen.height + RAND + 14
      : oben >= karte.h + 24 ? rahmen.top - RAND - 14 - karte.h
      : Math.max(12, vh - karte.h - 12);
    left = Math.min(Math.max(12, rahmen.left + rahmen.width / 2 - breite / 2), vw - breite - 12);
  }
  const klein = rahmen && rahmen.width < 280 && rahmen.height < 120;   // Knopf o. Ä. → Tipp-Animation

  const knopf = { minHeight: 38, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 4000 }} aria-live="polite">
      <style>{CSS}</style>
      {rahmen ? (
        <div style={{
          position: "fixed", top: rahmen.top - RAND, left: rahmen.left - RAND,
          width: rahmen.width + 2 * RAND, height: rahmen.height + 2 * RAND,
          borderRadius: 10, border: `2px solid ${F.akzent}`, boxShadow: `0 0 0 9999px ${SCHLEIER}`,
          transition: "top .4s ease, left .4s ease, width .4s ease, height .4s ease", pointerEvents: "none",
        }}>
          <div style={{ position: "absolute", inset: -2, borderRadius: 10, animation: "tourPuls 1.8s ease-out infinite" }} />
          {klein && <div style={{
            position: "absolute", left: "50%", top: "50%", width: 34, height: 34, borderRadius: "50%",
            border: `3px solid ${F.akzent}`, animation: "tourTipp 1.6s ease-out infinite",
          }} />}
        </div>
      ) : (
        <div style={{ position: "fixed", inset: 0, background: SCHLEIER }} />
      )}
      {hinweis && (
        <div style={{
          position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100vw - 24px)",
          background: F.akzent, color: "#1c2127", borderRadius: 999, padding: "5px 14px",
          fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 4px 14px rgba(0,0,0,.4)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none",
        }}>{hinweis}</div>
      )}
      {bereit && (
        <div ref={karteRef} key={index} role="dialog" aria-modal="true" aria-labelledby="tour-titel" style={{
          position: "fixed", top, left, width: breite, boxSizing: "border-box",
          background: F.karte, border: `1px solid ${F.rand}`, borderRadius: 12, padding: "16px 18px",
          color: F.text, fontFamily: "inherit", boxShadow: "0 14px 36px rgba(0,0,0,.55)",
          animation: "tourEin .28s ease",
        }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }} aria-label={`Schritt ${index + 1} von ${schritte.length}`}>
            {schritte.map((_, i) => <span key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= index ? F.akzent : F.rand, transition: "background .3s" }} />)}
          </div>
          <div id="tour-titel" style={{ fontWeight: 700, fontSize: 16, marginBottom: s.text ? 6 : 0 }}>{s.titel}</div>
          {s.text && <div style={{ fontSize: 14, lineHeight: 1.5, color: "#c8d0da" }}>{s.text}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
            <button onClick={() => ende.current()} style={{ ...knopf, background: "none", color: F.leise, padding: "8px 4px" }}>Beenden</button>
            <div style={{ flex: 1 }} />
            {index > 0 && <button onClick={zurueck} style={{ ...knopf, background: "#2a3547", color: "#c8d0da" }}>Zurück</button>}
            <button onClick={weiter} autoFocus style={{ ...knopf, background: F.akzent, color: "#1c2127" }}>{letzter ? "Fertig" : "Weiter"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Erster Start ohne Plan: bildschirmfüllend, bevor man etwas anderes sieht
export function Willkommen({ onJa, onNein }) {
  const knopf = { display: "block", width: "100%", minHeight: 48, padding: "12px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 16, fontWeight: 600, fontFamily: "inherit" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 4100, background: F.grund, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{CSS}</style>
      <div role="dialog" aria-modal="true" aria-labelledby="willkommen-frage" style={{ width: "100%", maxWidth: 380, textAlign: "center", color: F.text, fontFamily: "inherit", animation: "tourEin .4s ease" }}>
        <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">⚡</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: F.akzent, letterSpacing: ".06em", margin: "10px 0 34px" }}>STROMPLANER</div>
        <div id="willkommen-frage" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35, marginBottom: 26 }}>Hast du Stromplaner schon mal verwendet?</div>
        <button onClick={onJa} style={{ ...knopf, background: "#2a3547", color: F.text, marginBottom: 10 }}>Ja, Tutorial überspringen</button>
        <button onClick={onNein} autoFocus style={{ ...knopf, background: F.akzent, color: "#1c2127" }}>Nein, Tutorial ansehen</button>
      </div>
    </div>
  );
}
