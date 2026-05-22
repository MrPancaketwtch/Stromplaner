# STROMPLANER – Übergabe-Notiz für Claude Code
_Erstellt aus Chat-Session in claude.ai, Mai 2026_

---

## Projektübersicht

Der Stromplaner ist ein browserbasiertes Tool zur Drehstrom-Planung für
Veranstaltungstechnik. Er läuft als einzelne, vollständig offline-fähige
HTML-Datei (alle Abhängigkeiten eingebettet). Entwickelt für den NDR-
Produktionsbetrieb.

**Technologie-Stack:**
- React 18 (UMD, kein Build-Step für den Endnutzer)
- SheetJS (xlsx) für Excel-Export
- Kein Backend, kein Server, keine externen Abhängigkeiten zur Laufzeit
- Autosave via localStorage (Key: `stromplaner_autosave`)
- Build-Prozess: esbuild transpiliert JSX → IIFE-Bundle → in HTML eingebettet

**Dateien:**
```
Stromplaner.jsx     Quellcode (React, JSX) – hier wird entwickelt
Stromplaner.html    Standalone-Build (852KB, alles eingebettet) – wird verteilt
LIESMICH.txt        Dokumentation für Endnutzer
NDR_Standard.json   Standardkonfiguration (Kasten-Typen + Verbraucher)
```

**Build-Befehl** (setzt esbuild, React UMD und SheetJS UMD voraus):
```bash
# 1. Imports entfernen + App mounten
node -e "
  const fs=require('fs');
  let c=fs.readFileSync('Stromplaner.jsx','utf8');
  c=c.replace(/import React[^\n]*\n/,'');
  c=c.replace(/import \* as XLSX[^\n]*\n/,'');
  c=c.replace('export default function App','function App');
  c='const { useState, useMemo, useEffect, useRef, useCallback } = React;\n'+c;
  c+='\nReactDOM.createRoot(document.getElementById(\"root\")).render(React.createElement(App));\n';
  fs.writeFileSync('app_standalone.jsx',c);
"

# 2. JSX transpilieren
npx esbuild app_standalone.jsx \
  --loader:.jsx=jsx \
  --format=iife \
  --outfile=app_bundle.js \
  --jsx-factory=React.createElement \
  --jsx-fragment=React.Fragment

# 3. HTML zusammenbauen (react.production.min.js, react-dom.production.min.js,
#    xlsx.full.min.js müssen lokal vorliegen)
node build_html.js
```

---

## Datenmodell (v4)

### State-Struktur
```javascript
meta: {
  production, creator, version, date
}

mainConns: [{          // Hauptanschlüsse / Einspeisepunkte
  id, name, amp
}]

boxTypes: [{           // Kasten-Typen (Stammdaten)
  id, name,
  feedConnector,       // z.B. "CEE32" (Key aus CONN-Objekt)
  feedAmp,             // Absicherung Einspeisung
  outlets: [{
    id, label,
    connector,         // z.B. "SCHUKO", "MC", "CEE32" etc.
    amp,               // Absicherung dieses Abgangs
    phase,             // "L1"/"L2"/"L3" (1-phasig) oder "L1L2L3" (3-phasig)
    breaker,           // "B"/"C"/"D"/"K" — Standard: "C"
    protection,        // "LS"/"RCD"/"RCBO" — Schuko/MC: "RCBO", CEE3ph: "LS"
    mcSlots,           // nur bei connector==="MC": Anzahl Steckplätze (default 6)
  }]
}]

loads: [{              // Verbraucher-Stammdaten
  id, name, watt,
  threePhase           // boolean — 3-phasig: Last gleichmäßig auf L1/L2/L3
}]

instances: [{          // Aktivierte Kästen für diese Veranstaltung
  id, typeId, name,
  parentId,            // ID eines anderen instance (Kaskade) oder null
  parentOutletId,      // Abgang am Parent, auf dem dieser Kasten steckt
  mainConnectionId,    // ID eines mainConn (nur für Root-Instanzen) oder null
}]

placements: [{         // Verbraucher-Steckungen
  id, instanceId,
  outletId,            // Abgang-ID aus boxType.outlets
  mcSlot,              // null oder Nummer (1-N) bei Multicore-Abgängen
  loadId,              // Verbraucher-ID
}]
```

### Berechnungslogik
- **1-phasig:** `A = watt / 230`, landet auf der Phase des Abgangs (`outlet.phase`)
- **3-phasig:** `A = watt / 230 / 3` je Phase, immer L1+L2+L3 gleichzeitig
- **Multicore-Steckplätze:** Phase rotiert automatisch — Steckplatz 1=L1, 2=L2,
  3=L3, 4=L1, … (`PHASES[(mcSlot-1) % 3]`)
- **Kaskadierung:** `totalLoad(id)` = ownLoad(id) + Summe aller Child-Instanzen
  → Phasen bleiben erhalten (L1→L1, L2→L2, L3→L3), kein Phasentausch
- **Überprüfung:** Peak-Phase > feedAmp = Überlast (rot), > 80% = Warnung (orange)

### Stecker-Typen (CONN-Objekt)
```javascript
CEE16/32/63/125   3-phasig (phases:3)
CEE16_1/CEE32_1   1-phasig (phases:1)
PL125/200/400     Powerlock, 3-phasig
MC                Multicore, 1-phasig, isMulticore:true
SCHUKO            1-phasig
```
- `is3ph(connector)` → 3-phasige Abgänge (nur für 3-phasige Verbraucher)
- `isMulticore(connector)` → Multicore-Abgänge (Steckplatz-Dropdown aktiv)

---

## UI-Struktur

```
Header:  ⚡ STROMPLANER  |  [Meta]  |  💾auto  ↥Laden  💾Speichern  ⭐Standard  ↺Neu  🖨PDF  ⬇Excel

Tabs:    1·Konfiguration  |  2·Steckplan  |  3·Übersicht  |  Schaltbild  |  Kasten-Typen  |  Verbraucher
```

**1 · Konfiguration:**
- Produktionsdaten (Name, Ersteller, Version, Datum)
- Hauptanschlüsse definieren (mehrere möglich, Name + Max A)
- Kästen aktivieren: Typ wählen → Instanz anlegen
- Pro Instanz: Name, Kaskade (hängt an Kasten X, Abgang Y),
  Hauptanschluss-Zuweisung (nur für Root-Instanzen, optional)

**2 · Steckplan:**
- Oben: Live-Gesamtlast je Hauptanschluss (sticky)
- Kasten-Tabs (⚠ bei Überlast)
- Pro Kasten: sticky Phasenbalken + Verbraucherliste
- Verbraucher-Dropdown: InlineSelect (Suche direkt im Trigger)
- Abgang-Dropdown: FilterSelect (Schuko zuerst, dann alphabetisch)
- Bei Multicore-Abgang: zusätzliches Steckplatz-Dropdown (1–N, Phase auto)
- Phase-Spalte: wird automatisch gesetzt, nicht editierbar

**3 · Übersicht:**
- Summenlast je Hauptanschluss mit Phasenbalken
- Tabelle aller Instanzen mit Status

**Schaltbild:**
- SVG-Baumdarstellung der Kaskade
- Hauptanschlüsse als Wurzelknoten (orange, gestrichelt)
- Kästen als Nodes mit Phasenwerten + Auslastungsbalken
- Lastwerte an Verbindungslinien

**Kasten-Typen / Verbraucher:**
- Stammdaten, vollständig editierbar
- Löschen nur mit Bestätigungsdialog; in Benutzung = blockiert

---

## Wichtige Implementierungsdetails

**Dropdowns:**
- `InlineSelect`: für Verbraucher — Suche direkt im Trigger-Feld
- `FilterSelect`: für alle anderen — Filterfeld im Popup
- Beide: `position:fixed` via `getBoundingClientRect()` → kein Clipping
  durch overflow:hidden von Parent-Containern
- Flip nach oben wenn kein Platz unten
- Alphabetisch sortiert mit `localeCompare("de", {numeric:true})`
- Schuko-Abgänge immer zuerst (`sortOutlets()`)

**Validierungen:**
- Abgang-Amp ≤ feedAmp (blockiert mit Alert)
- Aufstecken auf kleineren Abgang → confirm()-Dialog mit Warnung
- Löschen Kasten-Typ → confirm()-Dialog
- 1-phasige Verbraucher sehen nur 1-phasige Abgänge und umgekehrt

**Migration (migrateOutlet / migrateBoxType):**
- Fehlende Felder werden beim Laden ergänzt
- Standard: breaker="C", protection="RCBO" für Schuko/MC, "LS" für CEE 3ph
- mcSlots=6 für Multicore falls nicht gesetzt
- Wird auf alle geladenen JSON-Dateien angewendet (auch alte Versionen)

**Autosave:**
- Key: `stromplaner_autosave` in localStorage
- Debounced: 600ms nach letzter Änderung
- Lädt beim App-Start automatisch
- `↺ Neu`-Button: setzt Meta/Instanzen/Steckungen zurück,
  Kasten-Typen und Verbraucher bleiben erhalten

**JSON-Format:**
```javascript
{
  _format: "stromplaner",
  _version: 4,
  meta, mainConns, boxTypes, loads, instances, placements
}
```

---

## Offene Roadmap (noch nicht umgesetzt)

- [ ] Dynamisches Errichtungsprotokoll auf Basis der Planung
- [ ] Default-JSON beim HTML-Öffnen automatisch laden (ohne manuelles
      Laden der NDR-Standarddatei) — browserbasierte file://-Einschränkungen
      erschweren das; möglicher Workaround: ServiceWorker oder
      Electron-Wrapper
- [ ] README aktualisieren (Hauptanschlüsse, Multicore-Steckplätze,
      Autosave, neue Buttons dokumentieren)

---

## Kontext für den NDR-Einsatz

- Alle Endstromkreise (Schuko, Multicore): RCBO, Charakteristik C
- Multicores: alle gleich verdrahtet, Phase rotiert 1→L1, 2→L2, 3→L3, 4→L1…
- Kästen kaskadieren 3-phasig CEE, Phasen bleiben erhalten
- Typische Kaskade: Hausanschluss → Kasten 14/11B → Kasten 3/4 → Kasten 5/5H
- Hauptanschlüsse können mehrere sein (verschiedene Hallenspeisepunkte)
- Alle Berechnungen einphasig W/230V, 3-phasig W/230V/3 je Phase

---

_Zum Starten: `Stromplaner.jsx` öffnen, Roadmap-Punkt wählen, loslegen._
