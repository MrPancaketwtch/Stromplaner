# ⚡ Stromplaner

Planungs- und Prüftool für mobile Drehstrom-Verteilanlagen in der Veranstaltungstechnik.

Stromplaner bildet die vollständige Stromverteilung einer Produktion ab: Kästen werden in einer Kaskade miteinander verbunden, Verbraucher auf Steckplätze verteilt, Phasenlasten automatisch berechnet. Ein Blockschaltbild visualisiert die gesamte Topologie. Integriert sind ein Errichtungsprüfungs-Protokoll nach DIN VDE 0100-600 sowie Berechnungshelfer für Leitungsdimensionierung und Spannungsfall.

> **Hinweis:** Die Werte sind eine Planungshilfe. Auslegung, Absicherung und sichere Installation liegen in der Verantwortung der zuständigen Elektrofachkraft.

---

## Schnellstart

1. Installer aus `dist/` ausführen (einmalig)
2. **Erster Start:** **Kästen und Verbraucher selber anlegen** oder **↥ Laden** → `app/Standard.json` auswählen, um NDR-Kasten-Typen und Verbraucher vorzuladen
3. Planen, stecken, prüfen
4. Mit **💾 Speichern** regelmäßig als `.json` sichern → Datei in `Speicherstände/` ablegen
5. **🖨 PDF** für den fertigen Stromplan oder das Prüfprotokoll → **Achtung** zwei verschiedene Exports: Einer für den Plan, einer für die Errichtungsprüfung

Der Zustand wird automatisch gespeichert (localStorage). Ein explizites Speichern ist nur nötig, um den Stand auf einen anderen Rechner zu übertragen, um zu archivieren, oder um in einem anderem Projekt zu arbeiten und vorher den aktuellen Stand zu sichern.

**Updates** werden automatisch im Hintergrund geladen. Sobald ein Update bereit ist, erscheint im Header ein **↓ Update bereit**-Button, der einen Neustart-Dialog öffnet.

---

## Ordnerstruktur

```
Stromplaner/
├── app/
│   ├── Stromplaner.html      ← Gebündelte App (Output von build.js)
│   ├── Stromplaner.jsx       ← Quellcode (React 18)
│   └── Standard.json         ← Vorgeladene Kasten-Typen & Verbraucher
├── dist/                     ← NSIS-Installer (für Weitergabe)
├── Speicherstände/           ← Eigene Planungen (.json) ablegen
├── src/
│   ├── main.js               ← Electron-Hauptprozess
│   ├── preload.js            ← IPC-Brücke (contextBridge)
│   └── splash.html           ← Startbildschirm
├── scripts/
│   ├── build.js              ← Build-Skript (esbuild → standalone HTML)
│   ├── afterPack.js          ← rcedit-Hook (Icon in .exe einbetten)
│   └── release.bat           ← Version bauen & auf GitHub veröffentlichen
├── build/
│   ├── icon.png
│   └── icon.ico
└── package.json
```

---

## Tabs im Tool

### 1 · Konfiguration
Grundlegende Produktionsdaten und Aufbau der Verteilerstruktur.

- Produktionsname, Ersteller, Version, Datum eintragen
- **Hauptanschlüsse** definieren: Bezeichnung und Maximalstrom (erscheinen links im Blockschaltbild)
- **Kästen aktivieren:** Typ wählen → Name vergeben → **+ Kasten hinzufügen**
- Pro Kasten: übergeordneten Kasten und Ausgang wählen (oder einem Hauptanschluss zuweisen)
- Adapter-Verbindungen sind möglich, werden farblich hervorgehoben
- Überlastete Kästen werden mit ⚠ markiert; unterdimensionierte Anschlüsse ebenso
- **Alle Kästen löschen** entfernt alle angelegten Instanzen auf einmal

### 2 · Steckplan
Verbraucher auf Steckplätze der Kästen verteilen.

- Pro aktiviertem Kasten ein eigener Abschnitt
- Live-Anzeige der Phasenlast (L1 / L2 / L3) mit Farbkodierung: grün ≤ 80 % · orange > 80 % · rot = Überlast
- Verbraucher wählen → Anschluss wählen → Phase wird automatisch gesetzt
- Nur passende Steckplätze sichtbar (1-phasig ↔ 3-phasig getrennt)
- **Multicore-Sonderfall:** Bei MC-Anschlüssen wird zusätzlich der Steckplatz (Slot 1–n) gewählt; Phase rotiert automatisch (L1→L2→L3→L1…)
- Bulk-Eintrag: mehrere identische Verbraucher auf einmal hinzufügen

### 3 · Übersicht
Kompakte Gesamtschau der Anlage.

- Alle Hauptanschlüsse mit Summenlast je Phase
- Tabelle aller Kästen mit Typ, Einspeisung, Last und Status

### Blockschaltbild
Topologie der gesamten Verteilerkaskade als SVG-Baumdiagramm.

- Kästen als Blöcke mit Einspeisung, Ausgängen (IEC 60309-Symbolen), MCB/RCD-Übersicht im Footer
- Verbindungslinien exakt am jeweiligen Ausgang des Eltern-Kastens; Steckerfamilie als Label
- Connector-Type-Fallback: fehlende oder veraltete `parentOutletId` wird automatisch über den Eingangs-Steckertyp aufgelöst; orange gestrichelte Linie + ⚠ als Warnung
- Verbraucher als Leaf-Boxen rechts neben dem Ausgang (Name, Watt, Ampere)
- **Multicore:** Ch.X-Badge je Verbraucher-Box zeigt den belegten Steckplatz
- Adapter-Verbindungen lila hervorgehoben
- PDF-Export: SVG wird automatisch auf Seitenbreite skaliert, vollständige Farbumwandlung Dark → Light für druckfreundliche Darstellung

### Errichtungsprüfung
Vollständiges Prüfprotokoll nach DIN VDE 0100-600 für mobile Stromverteilungen.

**Kopfdaten:** Prüfer, Datum, Uhrzeit, Messgerät, Adresse, Ort, Netzform

**Pro Kasten:**
- Sichtprüfung (6 Punkte, klickbar ok / offen)
- Netzspannungen L–N, L–L, L–PE, N–PE mit Grenzwertampel
- Drehfeld (Rechts- / Linksdrehfeld)
- RCD-Prüfung pro Schutzorgan: Auslösezeit t_A (ms) ≤ 300 ms · Auslösestrom I_An (mA) ≤ Nennwert · OK-Checkbox
  - Separate RCD-Objekte (FI-Schalter für Gruppe) als eigene Zeilen
  - RCBO-Ausgänge einzeln; **Multicore-Ausgänge werden in Einzelslots expandiert** (SP 1 … SP n, je mit Phasenzuordnung)
- Schleifenimpedanz Z_s (Ω) und Kurzschlussstrom I_k (A) pro Abgang
  - Multicore-Ausgänge ebenfalls in Einzelslots aufgeteilt
  - **Grenzwerte:** Ohne RCD gilt `Z_s ≤ U₀ / (Iₙ × 10)` (Abschaltbedingung LSS). Bei RCD-/RCBO-geschützten Abgängen wäre der theoretische Grenzwert `U₀ / IΔn ≈ 7.666 Ω` (30 mA), da der RCD bereits bei 30 mA auslöst — unabhängig von der Schleifenimpedanz. In der Praxis signalisieren Werte über **2 Ω** jedoch einen schlechten Schutzleiterkontakt und sollten untersucht werden. Das Tool verwendet daher **2 Ω** als Praxisgrenze für RCD-geschützte Stromkreise.
- Bemerkung / Auflage mit Schweregrad (Mangel / Hinweis)

**Export:** Mehrseitiges Prüfprotokoll als druckbares PDF im DIN-A4-Layout mit Deckblatt, Mängelliste und Unterschrift.

### Kasten-Typen *(Stammdaten)*
Verwaltung aller Verteilerkästen-Typen.

- Name, Eingangs-Steckverbinder, maximaler Speisestrom
- Beliebig viele Ausgänge: Label, Stecker-Typ, Nennstrom, Phase, Sicherungscharakteristik (B/C/D/K), Schutzart (LS / RCBO / Keine)
  - Multicore-Ausgänge: Anzahl Steckplätze (1–48) konfigurierbar
- **Bulk-Hinzufügen:** Mehrere Ausgänge gleichen Typs auf einmal anlegen — Anzahl, Stecker, Ampere, Sicherung, Schutzart wählen; optional RCD-Gruppe zuweisen und Phasenrotation aktivieren (L1→L2→L3→…)
- RCD-Objekte (separate FI-Schalter): Strom, Auslösestrom (mA), Polzahl
- **Alle Kasten-Typen löschen** entfernt alle Typen auf einmal
- Import / Export als JSON

### Verbraucher *(Stammdaten)*
- Name, Leistung in Watt, 1-phasig oder 3-phasig
- **3-phasig:** Watt-Wert = Leistung je Phase → Strom (A = W ÷ 230) auf L1, L2 und L3
- **1-phasig:** Strom = W ÷ 230 auf eine Phase
- Import / Export als JSON

### Erweitert
Berechnungshelfer. Nach Klick auf „Erweitert" in der Navigation erscheinen zwei Unter-Tabs.

#### Leitungsdimensionierung
Prüfkette für H07RN-F-Leitungen nach DIN VDE 0298-4: **I_B ≤ I_n ≤ I_z**

| Eingabe | Bedeutung |
|---------|-----------|
| I_B | Betriebsstrom (A) |
| I_n | Nennstrom der Sicherung (A) |
| Querschnitt | H07RN-F-Querschnitt (1,5 … 95 mm²) |

Korrekturfaktoren (alle optional):

| Faktor | Werte |
|--------|-------|
| Umgebungstemperatur | 10 … 50 °C |
| Stromführende Adern | 2 … 6 Adern |
| Aufgewickelt | 1 … 3 Lagen |
| Häufung – Verlegeart | Einlagig / Gebündelt |
| Häufung – Anzahl | 1 … 10 Leitungen |

Ergebnis: Gesamtfaktor, I_z (Basis & korrigiert), Ampel für I_B ≤ I_n und I_n ≤ I_z.

#### Spannungsfall
Formelrechner nach DIN VDE 0100-520.

| Eingabe | Bedeutung |
|---------|-----------|
| I | Strom (A) |
| l | Leitungslänge (m) |
| cos φ | Leistungsfaktor |
| Querschnitt | frei in mm² |
| Phasigkeit | 1-phasig / 3-phasig |

Ergebnis: ΔU in V und %, Mindestquerschnitt für ΔU ≤ 3 %, Farbampel (≤ 3 % grün · ≤ 5 % orange · > 5 % rot).

Beide Unter-Tabs erlauben beliebig viele benannte Einzel-Rechnungen (**+ Neue Rechnung**). Alle Rechnungen werden automatisch gespeichert.

---

## Header-Buttons

| Button | Funktion |
|--------|----------|
| **↥ Laden** | Gespeicherten Stand (`.json`) laden |
| **💾 Speichern** | Aktuellen Stand als `.json` exportieren |
| **↺ Neu** | Planung zurücksetzen (Kasten-Typen und Verbraucher bleiben erhalten) |
| **🖨 PDF** | Druckbaren Stromplan als PDF öffnen |
| **↓ Update bereit** | Erscheint automatisch wenn ein Update heruntergeladen wurde |

---

## Berechnungslogik

### Phasen & Last
```
1-phasig:  I (A) = W / 230  → auf die Phase des Anschlusses
3-phasig:  I (A) = W / 230  → gleicher Wert auf L1, L2, L3
Multicore: Phase rotiert nach Slot-Nummer: L1 → L2 → L3 → L1 …
```
Kaskadenberechnung: Die Last eines Kastens umfasst alle direkt gesteckten Verbraucher plus die Summe aller angehängten Unter-Kästen (rekursiv).

### Leitungsdimensionierung
```
I_z = I_base(Querschnitt) × f_Temp × f_Adern × f_Lagen × f_Häufung
Prüfkette: I_B ≤ I_n ≤ I_z
```
Basiswerte H07RN-F (DIN VDE 0298-4, frei in Luft):
1,5 mm² → 23 A · 2,5 mm² → 30 A · 4 mm² → 38 A · 6 mm² → 48 A · 10 mm² → 64 A · 16 mm² → 84 A · 25 mm² → 109 A · 35 mm² → 135 A · 50 mm² → 162 A

### Spannungsfall
```
1-phasig:  ΔU = (2 × I × l × cos φ) / (κ × A)
3-phasig:  ΔU = (√3 × I × l × cos φ) / (κ × A)
κ(Cu) = 56 m/(Ω·mm²)    ΔU% = ΔU / 230 V × 100
```

---

## Entwicklerinfos

### Stack
| Komponente | Technologie |
|------------|-------------|
| UI | React 18 (JSX) |
| Build | esbuild → standalone IIFE |
| Output | Einzelne HTML-Datei (keine externen Abhängigkeiten) |
| Desktop-Wrapper | Electron 33 (NSIS-Installer für Windows) |
| Auto-Update | electron-updater via GitHub Releases |
| Persistenz | localStorage (Autosave, 600 ms debounce) |
| Diagramm | SVG (manuelles Layout, kein D3 o. ä.) |

### Build & Release

**Einmalige Einrichtung:**
```bash
npm install
```

**Nach Änderungen an `app/Stromplaner.jsx` neu bauen:**
```bash
npm run build
```
Das Skript bündelt JSX + React mit esbuild zu `app/Stromplaner.html`.

**App starten (Dev-Modus, kein Installer nötig):**
```bash
npm start
```

**Lokalen Installer bauen (ohne GitHub-Release):**
```bash
npm run dist
# → dist/Stromplaner Setup x.x.x.exe
```

**Neue Version veröffentlichen:**
1. Version in `package.json` erhöhen (z. B. `1.0.7` → `1.0.8`)
2. `scripts\release.bat` ausführen (oder `npm run release`)
3. Das Skript baut, signiert und lädt den Installer + Metadaten als GitHub Release hoch
4. Installierte Apps erkennen das Update beim nächsten Start automatisch

> Für den Release wird ein GitHub-Token mit `repo`-Berechtigung als Windows-Umgebungsvariable `GH_TOKEN` benötigt.

### Dateiformat (Autosave / JSON-Export)
```json
{
  "_format": "stromplaner",
  "_version": 4,
  "meta": { ... },
  "mainConns": [ ... ],
  "boxTypes": [ ... ],
  "loads": [ ... ],
  "instances": [ ... ],
  "placements": [ ... ],
  "inspMeta": { ... },
  "inspResults": { ... },
  "cableCalcs": [ ... ],
  "voltCalcs": [ ... ]
}
```

### Wichtige Datenstrukturen
```
BoxType:    { id, name, feedConnector, feedAmp, outlets[], rcds[] }
Outlet:     { id, label, connector, amp, phase, breaker, char, protection, rcdId, mcSlots? }
RCD:        { id, label, amp, mA, poles }
Instance:   { id, typeId, name, parentId, parentOutletId, mainConnectionId }
Placement:  { id, instanceId, outletId, mcSlot, loadId }
Load:       { id, name, watt, threePhase }
```

### Connector-Typen
`CEE16` · `CEE32` · `CEE63` · `CEE125` · `CEE16_1` · `CEE32_1` · `PL125` · `PL200` · `PL400` · `MC` · `SCHUKO`

Adapter-Verbindungen sind innerhalb einer Steckerfamilie (CEE3P, CEE1P, PL, MC, SCHUKO) erlaubt und werden im Blockschaltbild lila hervorgehoben.

---

Kontakt / Fragen: silas.roesler@pm.me
