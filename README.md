# ⚡ Stromplaner

Browserbasiertes Tool zur Drehstrom-Planung für Veranstaltungstechnik, entwickelt für den NDR-Produktionsbetrieb.

Man legt fest, welche Unterverteilungen (Kästen) verwendet werden, wie sie miteinander verbunden sind, und welcher Verbraucher auf welchem Steckplatz landet. Das Tool berechnet automatisch die Last pro Phase (L1/L2/L3) je Kasten und summiert alles bis zum Hauptanschluss. Zusätzlich gibt es ein Blockschaltbild der gesamten Kaskade.

> **Hinweis:** Die Werte sind eine Planungshilfe. Die Verantwortung für Auslegung, Absicherung und sichere Installation liegt bei der zuständigen Elektrofachkraft.

---

## Schnellstart

1. `Das Tool/Stromplaner.html` per Doppelklick im Browser öffnen *(Chrome, Firefox, Edge)*
2. **Beim ersten Start:** **↥ Laden** → Standard-Datei aus `NDR Standardeinstellungen` auswählen *(danach nicht mehr nötig – das Tool merkt sich alles automatisch)*
3. Planen
4. Regelmäßig mit **💾 Speichern** sichern → Datei in `Speicherstände` ablegen
5. Am Ende **⬇ Excel** oder **🖨 PDF** für den fertigen Plan

Kein Internet erforderlich. Alles läuft lokal auf dem Gerät.

---

## Ordnerstruktur

| Ordner | Inhalt |
|--------|--------|
| `Das Tool/` | `Stromplaner.html` – das eigentliche Programm |
| `NDR Standardeinstellungen/` | Standard-JSON mit allen Kästen und Verbrauchern – **einmalig** beim ersten Start laden (danach speichert das Tool den Zustand automatisch im Browser) |
| `Speicherstände/` | Eigene Planungen pro Veranstaltung (`.json`) |

---

## Ablauf im Tool

### 1 · Konfiguration
- Produktionsname, Ersteller, Version, Datum eintragen
- Hauptanschlüsse definieren (Bezeichnung + maximaler Strom)
- Kästen aktivieren: Typ aus dem Dropdown wählen → **+ Kasten hinzufügen**
- Pro Kasten: einstellen, an welchem Kasten und Anschluss er hängt *(z. B. „Kasten 5H hängt an Kasten 3, Anschluss 32A-2")*
- Kästen ohne Verbindung gelten als erster Punkt in der Kaskade
- Überlastete Kästen werden mit ⚠ markiert

### 2 · Steckplan
- Pro aktiviertem Kasten ein eigenes Tab
- Oben: Live-Anzeige der Gesamtlast an Hauptanschlüssen
- Pro Kasten: Phasenbalken zeigen Eigenlast und Gesamtlast *(grün = ok · orange = >80% · rot = Überlast)*
- **+ Verbraucher stecken**: Verbraucher wählen, dann Steckplatz wählen – Phase wird automatisch gesetzt
- Nur passende Steckplätze werden angezeigt (1-phasige Verbraucher sehen nur 1-phasige Anschlüsse und 3-phasige Verbraucher sehen nur 3-phasige Anschlüsse)

### 3 · Übersicht
- Hauptanschlüsse mit Gesamtlast aller Phasen
- Tabelle aller Kästen mit Status

### Schaltbild
- Baumdarstellung der gesamten Kaskade
- Lastwerte (L1/L2/L3) an den Verbindungslinien und in den Kästen
- Farbkodierung wie im Steckplan

### Kasten-Typen *(Stammdaten)*
- Alle Kasten-Typen mit ihren Anschlüssen vollständig editierbar
- Jeder Anschluss: Name, Stecker-Typ, Absicherung (A), Phase, Charakteristik (B/C/D/K), Schutzart (LS/RCD/RCBO)
- Anschluss-Absicherung kann die Einspeisung nicht übersteigen (wird blockiert)

### Verbraucher *(Stammdaten)*
- Liste aller Verbraucher mit Leistung in Watt
- **3-phasig**: eingetragener Watt-Wert = Leistung je Phase → Strom (A = W ÷ 230) wird auf L1, L2 und L3 kopiert
- **1-phasig**: Strom = W ÷ 230, auf eine Phase

---

## Knöpfe in der Kopfzeile

| Knopf | Funktion |
|-------|----------|
| **↥ Laden** | Gespeicherten Stand (`.json`) laden und weiterarbeiten |
| **💾 Speichern** | Aktuellen Stand als `.json` speichern |
| **↺ Neu** | Planung zurücksetzen – Kasten-Typen und Verbraucher bleiben erhalten |
| **🖨 PDF** | Druckbaren Plan öffnen (Browserdruckdialog) |
| **⬇ Excel** | Plan als `.xlsx` exportieren – kann **nicht** wieder ins Tool geladen werden, zum Weiterbearbeiten immer `.json` verwenden |

---

## Berechnungslogik

- **1-phasig:** `A = W / 230`, auf die Phase des Anschlusses
- **3-phasig:** `A = W / 230` je Phase, gleicher Wert auf L1, L2 und L3 *(Watt-Wert entspricht Leistung je Phase, wie in Datenblättern angegeben)*
- Phasen bleiben beim Aufstecken erhalten (L1→L1, L2→L2, L3→L3)
- Kaskadenberechnung summiert alle aufgesteckten Kästen rekursiv
- Prozentzahl bezieht sich immer auf die Einspeisung des jeweiligen Kastens

---

## Entwicklung & Build

> Nur relevant, wenn der Quellcode (`Das Tool/Stromplaner.jsx`) geändert wird.

**Einmalige Einrichtung:**

1. [Node.js](https://nodejs.org) installieren → LTS-Version
2. Terminal im Projektordner öffnen *(Rechtsklick → „In Terminal öffnen")*
3. Abhängigkeiten installieren:
   ```
   npm install
   ```

**Nach jeder Änderung an `Stromplaner.jsx`:**

`build.bat` doppelklicken – erzeugt eine aktualisierte `Das Tool/Stromplaner.html`.

Oder im Terminal:
```
npm run build
```

---

Bei Fragen oder Änderungswünschen: silas.roesler@pm.me
