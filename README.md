# ⚡ Stromplaner

Planungs- und Prüftool für mobile Drehstrom-Verteilanlagen in der Veranstaltungstechnik.

Stromplaner bildet die vollständige Stromverteilung einer Produktion ab: Verteiler werden in einer Kaskade miteinander verbunden, Verbraucher auf Steckplätze verteilt, Phasenlasten automatisch berechnet. Ein Schaltbild visualisiert die gesamte Topologie. Integriert sind ein Errichtungsprüfungs-Protokoll nach DIN VDE 0100-600 sowie Berechnungshelfer für Leitungsdimensionierung und Spannungsfall.

> **Hinweis:** Die Werte sind eine Planungshilfe. Auslegung, Absicherung und sichere Installation liegen in der Verantwortung der zuständigen Elektrofachkraft.

---

## Schnellstart

1. Neueste Version von der **[Releases-Seite](https://github.com/MrPancaketwtch/Stromplaner/releases)** herunterladen und installieren:
   - **Windows:** `Stromplaner Setup x.x.x.exe`
   - **macOS (Apple Silicon / M-Series):** `Stromplaner-x.x.x-arm64.dmg`
   - **macOS (Intel):** `Stromplaner-x.x.x.dmg`
   
   > **macOS-Hinweis:** Beim ersten Öffnen erscheint eine Warnung „Entwickler nicht verifiziert". Rechtsklick auf die App → **Öffnen** → **Öffnen** umgeht diese Meldung einmalig.
2. **Erster Start:** **Verteiler-Typen und Verbraucher selber anlegen** oder **Öffnen** → `app/Standard.json` auswählen, um Verteiler-Typen und Verbraucher vorzuladen
3. Planen, stecken, prüfen
4. Mit **Speichern** regelmäßig als `.json` sichern → Datei in `Speicherstände/` ablegen
5. **PDF** für den fertigen Stromplan oder das Prüfprotokoll → **Achtung** zwei verschiedene Exports: Einer für den Plan, einer für die Errichtungsprüfung

Der Zustand wird automatisch gespeichert. Ein explizites Speichern ist nur nötig, um den Stand auf einen anderen Rechner zu übertragen, um zu archivieren, oder um in einem anderem Projekt zu arbeiten und vorher den aktuellen Stand zu sichern.

**Verteiler-Typen und Verbraucher** werden zusätzlich automatisch als Bibliothek in AppData gespeichert (`AppData\Stromplaner\Speicherstände\Bibliothek.json` auf Windows, `~/Library/Application Support/Stromplaner/Speicherstände/Bibliothek.json` auf macOS) und beim Start von dort geladen – sie bleiben also erhalten, auch wenn ein anderer Planungsstand geöffnet wird. Bringt ein geladener Plan andere Typen oder Verbraucher mit, fragt Stromplaner, ob sie die Bibliothek **ergänzen** oder **ersetzen** sollen.

**Updates** werden unter Windows automatisch im Hintergrund geladen. Sobald ein Update bereit ist, erscheint im Header ein **Update bereit**-Button, der einen Neustart-Dialog öffnet.

**Beta-Versionen:** Im Dialog **Updates** lässt sich der Update-Kanal wählen. **Stabil** (Standard) liefert nur fertige Versionen, **Beta** zusätzlich Vorabversionen zum Testen. Wer auf Stabil zurückschaltet, bleibt auf der installierten Beta, bis eine neuere fertige Version erscheint.

Auf **macOS** ist die App nicht mit einem Apple-Entwicklerzertifikat signiert, deshalb kann sie sich nicht selbst austauschen. Stromplaner zeigt eine neue Version mit **↑ Update verfügbar** an. **Download-Seite öffnen** führt zum Release: dort die passende `.dmg` laden, öffnen und Stromplaner in den Programme-Ordner ziehen. Pläne, Bibliothek und Einstellungen bleiben erhalten.

---

## 📱 Handy-App (Android)

Die Handy-App ist für die Arbeit direkt an der Anlage gedacht, weil ein Laptop draußen im Feld unhandlicher ist. Zum Planen empfehle ich weiterhin die PC Anwendung, auch wenn natürlich beides geht. 
Aktuell befindet sich aufgrund einer Einschränkung des Google Play Stores die App nur im Early Access. Wenn du mir helfen willst, Feedback zu bekommen und die App öffentlich zu machen, kannst du sie unter folgendem Link runterladen: [Play Store](https://play.google.com/store/apps/details?id=de.stromplaner.app). Danke wenn du dir die Zeit nimmst. Alternativ kannst du natürlich die APK wie unten beschrieben installieren.

### Installation
- Die Datei `Stromplaner-x.x.x.apk` von der **[Releases-Seite](https://github.com/MrPancaketwtch/Stromplaner/releases)** aufs Handy laden und öffnen.
- Android fragt beim ersten Mal, ob Apps aus dieser Quelle installiert werden dürfen → für Browser bzw. Dateimanager erlauben.
- **Update:** Die neue APK einfach über die installierte App installieren – Pläne und Prüfergebnisse bleiben erhalten.
- **Einmalig beim Umstieg von einer älteren Test-Version** (bis 1.3.0-beta.1): Ab 1.3.0 hat die App die Kennung `de.stromplaner.app` (vorher `dev.stromplaner`). Android installiert sie deshalb **neben** der alten App statt als Update. Offene Prüfergebnisse in der alten App an den PC senden, dann die alte App deinstallieren. Ganz alte Versionen bis 1.2.1 lassen sich ohnehin nicht aktualisieren („App nicht installiert“).
- Alternativ läuft Stromplaner ohne Installation als Web-App unter **[mrpancaketwtch.github.io/Stromplaner](https://mrpancaketwtch.github.io/Stromplaner/)**. Der Austausch per Bluetooth und Sitzungen mit einem Server über `http://` funktionieren dort nicht – Bluetooth gibt es nur in der App, und der Browser lässt von einer HTTPS-Seite keine unverschlüsselten Verbindungen ins lokale Netz zu – für die Prüfung vor Ort die APK verwenden.

### Tabs in der Handy-App
| Tab | Inhalt |
|-----|--------|
| **Projekt** | **Planliste** (mehrere Pläne anlegen, wechseln, löschen), Projektdaten, **Stromplan als PDF** (wie am PC, ohne Blockschaltbild), **Firmenlogo** fürs PDF, **Verteiler-Typen** und **Verbraucher** (anlegen und bearbeiten) |
| **Steckplan** | Verteiler und Steckungen ansehen und anpassen. Am Steckplatz Verbraucher stecken (auch neu anlegen) und Unterverteiler anschließen oder dort neu anlegen; alternativ am Verteiler unter **Hängt an** |
| **Prüfung** | Errichtungsprüfung je Verteiler: Sichtprüfung, Spannungen, Drehfeld, Schleifenimpedanz am Eingang, RCD-Prüfung, Z_s / I_k je Abgang, Bemerkung. Grenzwerte werden wie am PC grün/rot markiert. Mit **Nächster ›** geht es von Verteiler zu Verteiler; „Weiter“ auf der Tastatur springt ins nächste Messfeld. **PDF speichern / drucken** öffnet den Android-Druckdialog („Als PDF speichern“ oder Drucker) – das PDF ist identisch mit dem vom PC, Text markierbar. **PDF direkt teilen** schickt eine Bild-Fassung sofort per Mail oder Messenger. Unter *Prüfungsdetails* lässt sich mit dem Finger unterschreiben. |
| **Teilen** | Per **Bluetooth** ohne Netzwerk und ohne Server mit dem PC austauschen |
| **Sitzung** | Einer Sitzung auf dem Planer-Server beitreten oder selbst eine starten: Prüfwerte erscheinen sofort bei allen (siehe „Sitzung“ weiter unten) |
| **Hilfe** | Geführte Rundgänge durch die App – beim ersten Start ohne Plan wird gefragt, ob du den Überblick sehen möchtest |

### Spontane Prüfung nur mit dem Handy
1. **Projekt** → **Neuer Plan**, Veranstaltung eintragen. Die bisherigen Pläne bleiben in der Planliste.
2. **Prüfung** → **Verteiler hinzufügen** → Typ wählen. Fehlt der Typ, über **Neuen Typ anlegen** Name, Einspeisung und Abgänge antippen (Schuko, CEE, Multicore …; Schutz LS/RCBO und Auslösecharakteristik je Abgang).
3. Unterverteiler im Tab **Steckplan** am Steckplatz anschließen (oder dort neu anlegen), Verbraucher stecken – fehlt einer, über **Neuer Verbraucher** anlegen.
4. Prüfen wie gewohnt, danach **PDF speichern / drucken** oder **PDF direkt teilen**.

Das Handy merkt sich die Verteiler-Typen und Verbraucher aller Pläne, die es je geladen hat oder in denen es in einer Sitzung war – ein neuer Plan startet mit dieser Bibliothek. Ein Plan vom PC (Bluetooth) und das Beitreten einer Sitzung legen jeweils einen eigenen Plan in der Liste an. Firmenlogo (Tab Projekt) und Unterschrift (Prüfungsdetails) bleiben wie am PC nur auf dem jeweiligen Gerät gespeichert.

### Plan zwischen PC und Handy austauschen (Bluetooth, ohne Netzwerk)
1. **Handy:** Tab **Teilen** → **Für den PC sichtbar machen** (beim ersten Mal die Berechtigung „Geräte in der Nähe“ erlauben, Bluetooth muss an sein). Alternativ im Tab Prüfung unter „An PC senden“ → **Per Bluetooth**.
2. **PC:** Header → **Teilen** → **Mit Handy verbinden** → das Handy in der Liste wählen. Eine Kopplung ist nicht nötig.
3. **Vom Handy holen:** wahlweise **Nur Prüfergebnisse** (empfohlen) oder **Ganzen Plan** übernehmen.
4. **Plan ans Handy senden:** Der Plan landet auf dem Handy als eigener Eintrag in der Planliste.

Der PC braucht Bluetooth LE (Windows 10/11, macOS fragt beim ersten Mal nach der Bluetooth-Erlaubnis). Der Plan wird komprimiert übertragen und ist meist in wenigen Sekunden durch. Solange das Handy sichtbar ist, holt der PC immer den aktuellen Stand.

### Planer-Server (für Sitzungen)
Für Sitzungen – mehrere PCs und Handys arbeiten gleichzeitig am selben Plan – nutzt Stromplaner den **[Planer-Server](https://github.com/Nomisimo/Planer-Server)**, den gemeinsamen, selbst-hostbaren Server der Planer-Familie (Stromplaner, Netzwerkplaner).

**Einrichten (Docker):**
```bash
git clone --recurse-submodules https://github.com/Nomisimo/Planer-Server.git
cd Planer-Server
mkdir -p data && sudo chown -R 1000:1000 data   # Server läuft im Container als Benutzer „node“ (UID 1000)
docker compose up -d --build
curl http://localhost:3001/health                # → {"ok":true,…}
```
Ohne den `chown`-Schritt legt Docker unter Linux den Datenordner als `root` an, und der Server kann nicht speichern. Unter Docker Desktop (Windows/macOS) ist er nicht nötig.

Der Server läuft auf Port 3001. Am PC unter **Sitzung** und am Handy im Tab **Sitzung** die Server-Adresse (z. B. `192.168.1.10` oder `http://192.168.1.10:3001`) eintragen. Optional schützt `AUTH_TOKEN` (in der `docker-compose.yml`) den Server; derselbe Token wird dann in beiden Apps eingetragen. Ohne HTTPS ist der Server nur fürs eigene Netz gedacht – aus dem Internet nur hinter einem Reverse-Proxy mit HTTPS erreichbar machen.

**Umstieg vom bisherigen Stromplaner-Sync-Server** (Ordner `server/` bis Version 1.2.x): Die Funktion „Sync“ (Pläne hoch-/herunterladen) gibt es ab 1.3.0 nicht mehr – sie ist durch Sitzungen ersetzt. Alte Pläne vom Sync-Server lassen sich so in den Planer-Server übernehmen und bleiben dort über `/api/plans` abrufbar:
```bash
# 1. Alten Server stoppen (im Ordner des alten Servers)
docker compose down
# 2. Pläne in den Planer-Server übernehmen (im Planer-Server-Ordner)
mkdir -p data/stromplaner/plans
cp /pfad/zum/alten/server/data/plans/*.json data/stromplaner/plans/
sudo chown -R 1000:1000 data
# 3. Planer-Server starten – einen bisherigen AUTH_TOKEN vorher in dessen docker-compose.yml eintragen
docker compose up -d --build
```
Server-URL und Token in den Apps bleiben unverändert.

---

## Ordnerstruktur

```
Stromplaner/
├── app/
│   ├── Stromplaner.html      ← Gebündelte App (Output von build.js)
│   ├── Stromplaner.jsx       ← Quellcode (React 18)
│   ├── sync/                 ← Sitzungen (Anbindung an den Planer-Server, auch von der Handy-App genutzt)
│   ├── shared/               ← Prüfprotokoll (HTML) – gemeinsam für PC-PDF und Handy-PDF
│   └── Standard.json         ← Vorgeladene Verteiler-Typen & Verbraucher
├── dist/                     ← NSIS-Installer (gitignoriert – wird via GitHub Releases verteilt)
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
├── webapp/                   ← Handy-App (React + Vite, als PWA und per Capacitor als Android-APK)
│   ├── src/App.jsx           ← Quellcode Handy-App
│   ├── assets/               ← App-Icon & Splash (Quelle für die Android-Icons)
│   └── capacitor.config.json
├── .github/workflows/
│   ├── release.yml           ← Windows + macOS bei Tag-Push
│   ├── android.yml           ← Android-APK (bei Tag-Push oder manuell)
│   └── webapp.yml            ← Web-App auf GitHub Pages bei Push auf main
└── package.json
```

---

## Tabs im Tool

### 1 · Konfiguration
Grundlegende Produktionsdaten und Aufbau der Verteilerstruktur.

- Produktionsname, Ersteller, Version, Datum eintragen
- **Einspeisepunkte** definieren: Bezeichnung und Maximalstrom (erscheinen links im Schaltbild)
- **Verteiler hinzufügen:** Typ wählen → Name vergeben → **+ Verteiler hinzufügen**
- Pro Verteiler: übergeordneten Verteiler und Steckplatz wählen (oder einem Einspeisepunkt zuweisen)
- Adapter-Verbindungen sind möglich, werden farblich hervorgehoben
- Überlastete Verteiler werden mit ⚠ markiert; unterdimensionierte Anschlüsse ebenso

### 2 · Steckplan
Verbraucher auf Steckplätze der Verteiler verteilen.

- Pro Verteiler ein eigener Abschnitt
- Live-Anzeige der Phasenlast (L1 / L2 / L3) mit Farbkodierung: grün ≤ 80 % · orange > 80 % · rot = Überlast
- Verbraucher wählen → Steckplatz wählen → Phase wird automatisch gesetzt
- Nur passende Steckplätze sichtbar (1-phasig ↔ 3-phasig getrennt)
- **Multicore-Sonderfall:** Bei MC-Steckplätzen wird zusätzlich der Slot (1–n) gewählt; Phase rotiert automatisch (L1→L2→L3→L1…)
- Bulk-Eintrag: mehrere identische Verbraucher auf einmal hinzufügen
- **RCCB-Gruppen:** Pro Verteiler können RCCB-Gruppen (Fehlerstromschutzschalter) definiert werden; einzelne Steckplätze werden dann der zugehörigen Gruppe zugewiesen

### 3 · Übersicht
Kompakte Gesamtschau der Anlage.

- Alle Einspeisepunkte mit Summenlast je Phase
- Tabelle aller Verteiler mit Typ, Einspeisung, Last und Status

### Schaltbild
Topologie der gesamten Verteilerkaskade als SVG-Baumdiagramm.

- Verteiler als Blöcke mit Einspeisung, Steckplätzen (IEC 60309-Symbolen), MCB/RCCB-Übersicht im Footer
- Verbindungslinien exakt am jeweiligen Steckplatz des Eltern-Verteilers; Steckerfamilie als Label
- Connector-Type-Fallback: fehlende oder veraltete `parentOutletId` wird automatisch über den Eingangs-Steckertyp aufgelöst; orange gestrichelte Linie + ⚠ als Warnung
- Verbraucher als Leaf-Boxen rechts neben dem Steckplatz (Name, Watt, Ampere)
- **Multicore:** Kennung „SP 1“, „SP 2“ … je Verbraucher-Box zeigt den belegten Steckplatz; fehlt die Zuordnung, erscheint ein oranges „SP ?“
- Adapter-Verbindungen lila hervorgehoben
- PDF-Export: SVG wird automatisch auf Seitenbreite skaliert, vollständige Farbumwandlung Dark → Light für druckfreundliche Darstellung

### Errichtungsprüfung
Vollständiges Prüfprotokoll nach DIN VDE 0100-600 für mobile Stromverteilungen.

**Kopfdaten:** Prüfer, Datum, Uhrzeit, Messgerät, Adresse, Ort, Netzform

**Pro Verteiler:**
- Sichtprüfung (6 Punkte, klickbar ok / offen)
- Netzspannungen L–N, L–L, L–PE, N–PE mit Grenzwertampel
- Drehfeld (Rechts- / Linksdrehfeld)
- RCCB-Prüfung pro Schutzorgan: Auslösezeit t_A (ms) ≤ 300 ms · Auslösestrom I_An (mA) im Bereich ½·Nennwert – Nennwert (Werte darunter oder darüber werden rot markiert)
  - RCCB-Gruppen (FI-Schalter für Gruppe) als eigene Prüfzeilen
  - RCBO-Steckplätze einzeln; **Multicore-Steckplätze werden in Einzelslots expandiert** (SP 1 … SP n, je mit Phasenzuordnung)
  - RCBO-Nennwert (mA) direkt am Steckplatz einstellbar (Standard: 30 mA)
- Schleifenimpedanz Z_s (Ω) und Kurzschlussstrom I_k (A) pro Steckplatz
  - Multicore-Steckplätze ebenfalls in Einzelslots aufgeteilt
  - **Grenzwerte:** Ohne RCD gilt `Z_s ≤ U₀ / (Iₙ × 10)` (Abschaltbedingung LSS). Bei RCCB-/RCBO-geschützten Steckplätzen wäre der theoretische Grenzwert `U₀ / IΔn ≈ 7.666 Ω` (30 mA), da der RCD bereits bei 30 mA auslöst — unabhängig von der Schleifenimpedanz. In der Praxis signalisieren Werte über **2 Ω** jedoch einen schlechten Schutzleiterkontakt und sollten untersucht werden. Das Tool verwendet daher **2 Ω** als Praxisgrenze für RCD-geschützte Stromkreise.
  - **Kaskadierte Unterverteiler:** Schleifenimpedanz steigt entlang des Leitungswegs — jedes Kabel addiert Impedanz. Damit gilt zwingend `Z_s(Eingang UV) < Z_s(Schuko-Steckplatz)`. Die Messung am **ungünstigsten Punkt** (schlechtester Schuko-Steckplatz) deckt alle vorgelagerten Kabelabschnitte mit ab und macht eine separate Messung am CEE-Eingang des Unterverteilers entbehrlich (DIN VDE 0100-600, Abschn. 643). Das Tool leitet den Z_s-Wert am UV-Eingang automatisch aus den Downstream-Messungen ab (kaskadiert über beliebig viele Ebenen). Falls der abgeleitete Wert den Grenzwert des Eingangsanschlusses überschreitet, kann per **„✎ Nachtragen"** ein separat gemessener Wert eingetragen werden — das Prüfprotokoll dokumentiert in diesem Fall automatisch den Grund und den abgeleiteten Vergleichswert.
- Bemerkung / Auflage mit Schweregrad (Mangel / Hinweis)

**Export:** Mehrseitiges Prüfprotokoll als druckbares PDF im DIN-A4-Layout mit Deckblatt, Mängelliste und Unterschrift.

### Verteiler-Typen *(Stammdaten)*
Verwaltung aller Verteiler-Typen.

- Name, Eingangs-Steckverbinder
- Beliebig viele Steckplätze: Label, Stecker-Typ, Nennstrom, Phase, Sicherungscharakteristik (B/C/D/K), Schutzart (LS / RCBO / Keine)
  - Multicore-Steckplätze: Anzahl Slots (1–48) konfigurierbar
- **Bulk-Hinzufügen:** Mehrere Steckplätze gleichen Typs auf einmal anlegen — Anzahl, Stecker, Ampere, Sicherung, Schutzart wählen; optional RCCB-Gruppe zuweisen und Phasenrotation aktivieren (L1→L2→L3→…)
- RCCB-Gruppen (separate FI-Schalter): Auslösestrom (mA), Polzahl
- **RCBO-Steckplätze:** Auslösestrom (mA) direkt am Steckplatz einstellbar (Standard: 30 mA)
- Import / Export als JSON

### Verbraucher *(Stammdaten)*
- Name, Leistung in Watt, 1-phasig oder 3-phasig
- **3-phasig:** Watt-Wert = Leistung je Phase → Strom (A = W ÷ 230) auf L1, L2 und L3
- **1-phasig:** Strom = W ÷ 230 auf eine Phase
- Import / Export als JSON

### Leitungsdimensionierung & Spannungsfall
Berechnungshelfer – die beiden orangen Tabs ganz rechts in der Navigation.

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

### ℹ Anleitung
Geführte Rundgänge statt Handbuch: Der Bildschirm wird abgedunkelt, die jeweilige Stelle hervorgehoben, dazu ein kurzer Satz – bei Bedarf wechselt der Rundgang selbst den Tab. Themen: Überblick, Planung anlegen, Verbraucher stecken, Bibliothek, Übersicht und Schaltbild, Errichtungsprüfung, Austausch mit dem Handy, Sitzung und Rechner. Die **?**-Knöpfe an einzelnen Abschnitten starten den passenden Rundgang an dieser Stelle.

Beim ersten Start ohne Plan fragt Stromplaner „Hast du Stromplaner schon mal verwendet?“ – mit **Nein, Tutorial ansehen** beginnt der Überblick. Die Frage erscheint nur, bis sie einmal beantwortet wurde. Die Handy-App hat dafür den Tab **Hilfe** mit eigenen Rundgängen.

---

## Header-Buttons

| Button | Funktion |
|--------|----------|
| **Logo** | Firmenlogo hochladen oder ersetzen (PNG, JPG, SVG) — erscheint in der App und im PDF |
| **✕** *(neben Logo, nur wenn eins gesetzt ist)* | Hochgeladenes Logo entfernen |
| **Neu** | Planung zurücksetzen (Verteiler-Typen und Verbraucher bleiben erhalten) |
| **Öffnen** | Gespeicherten Stand (`.json`) öffnen – mit Rückfrage, ob dessen Verteiler-Typen und Verbraucher die Bibliothek ergänzen oder ersetzen |
| **Zuletzt geöffnet** | Schnellzugriff auf die zuletzt geöffneten Planungsstände |
| **Speichern** | Aktuellen Stand als `.json` exportieren |
| **Teilen** | Plan per Bluetooth mit dem Handy austauschen – ohne Netzwerk und ohne Server |
| **Sitzung** / **2 online** | Mit anderen gleichzeitig am selben Plan arbeiten (siehe unten); in einer Sitzung zeigt der Knopf Status und Teilnehmerzahl |
| **Changelog** | Versionsverlauf mit allen Änderungen anzeigen |
| **Updates** / **Update bereit** | Erscheint automatisch wenn ein Update heruntergeladen wurde |
| **PDF** | Druckbaren Stromplan als PDF öffnen |

---

## 👥 Sitzung

Mehrere Personen bearbeiten denselben Plan gleichzeitig, jede Änderung erscheint sofort bei allen – am PC und in der Android-App. Voraussetzung ist ein erreichbarer [Planer-Server](#planer-server-für-sitzungen) und dieselbe Stromplaner-Version bei allen (PC und Handy).

1. Header → **Sitzung** → Server-Adresse (z. B. `192.168.1.10` oder `http://server:3001`), ggf. Server-Token und den eigenen Namen eintragen.
2. **Sitzung starten:** Name vergeben, optional einen Sitzungscode – der aktuelle Plan wird zum gemeinsamen Plan. Das geht am PC und auf dem Handy (Tab **Sitzung** → **Sitzung starten**).
3. **Beitreten:** Die anderen wählen die Sitzung aus der Liste (ggf. mit Code) – am PC unter **Sitzung**, auf dem Handy im Tab **Sitzung**. Ihr bisheriger Plan wird dabei durch den Stand der Sitzung ersetzt – vorher speichern bzw. Prüfergebnisse an den PC senden, falls nötig.

**Gut zu wissen:**
- Wer in einem Textfeld tippt, sperrt es kurz für die anderen; wer gleichzeitig dasselbe Feld ändern will, bekommt einen Hinweis und seine Eingabe wird zurückgenommen.
- Ändern zwei Personen dasselbe Feld kurz nacheinander, gilt die letzte Änderung; die andere Person bekommt einen Hinweis.
- Bricht die Verbindung ab, arbeitet man weiter – die Änderungen werden beim Wiederverbinden nachgeschickt.
- **Öffnen** und **Neu** (am Handy auch ein neu gescannter Plan) ersetzen in einer Sitzung den Plan für alle (mit Rückfrage).
- **Handy:** In der Android-App funktionieren Server mit `http://`. Die Web-App im Browser erreicht nur einen Server mit `https://`.
- Verteiler-Typen und Verbraucher der Sitzung landen – wie beim Laden eines Plans – auch in der eigenen Bibliothek.
- **Verlassen:** Man kann später wieder beitreten, der Plan bleibt lokal erhalten. **Für alle beenden** löscht die Sitzung auf dem Server; die anderen behalten ihren Stand als lokalen Plan.

---

## Berechnungslogik

### Phasen & Last
```
1-phasig:  I (A) = W / 230  → auf die Phase des Steckplatzes
3-phasig:  I (A) = W / 230  → gleicher Wert auf L1, L2, L3
Multicore: Phase rotiert nach Slot-Nummer: L1 → L2 → L3 → L1 …
```
Kaskadenberechnung: Die Last eines Verteilers umfasst alle direkt gesteckten Verbraucher plus die Summe aller angehängten Unterverteiler (rekursiv).

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
| UI | React 18 (JSX), Icons: [lucide-react](https://lucide.dev) (wie im Netzwerkplaner) |
| Build | esbuild → standalone IIFE |
| Output | Einzelne HTML-Datei (keine externen Abhängigkeiten) |
| Desktop-Wrapper | Electron 33 (NSIS für Windows, DMG für macOS) |
| Auto-Update | electron-updater via GitHub Releases |
| Persistenz | localStorage (Autosave, 600 ms debounce) |
| Diagramm | SVG (manuelles Layout, kein D3 o. ä.) |
| CI/CD | GitHub Actions (baut Windows + macOS + Android bei Tag-Push) |
| Handy-App | React 18 + Vite, Capacitor 8 (Android-APK), PWA via GitHub Pages; PDF über den Android-Druckdienst (eigenes Capacitor-Plugin `webapp/plugins/druck`) bzw. html2canvas + jsPDF |
| Datenaustausch PC ↔ Handy | Bluetooth LE: Web Bluetooth (PC), eigenes Capacitor-Plugin `webapp/plugins/bluetooth` (Handy) |
| Sitzungen | WebSocket zum [Planer-Server](https://github.com/Nomisimo/Planer-Server); Client in `app/sync/` (`sync-client.js`, `ops.js` unverändert aus dem Planer-Server übernommen, Apache 2.0 – siehe `app/sync/LICENSE` und `NOTICE`; Änderungen dort pflegen und hierher kopieren) |

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

**Neue Version veröffentlichen:**
1. CHANGELOG in `app/Stromplaner.jsx` aktualisieren
2. `scripts\release.bat` ausführen und neue Versionsnummer eingeben
3. Das Skript setzt die Version, baut, committet und pusht einen Git-Tag
4. GitHub Actions baut automatisch Windows (`.exe`) und macOS (`.dmg`) und lädt beide als GitHub Release hoch; die Android-APK wird einige Minuten später an dasselbe Release angehängt
5. Installierte Desktop-Apps erkennen das Update beim nächsten Start automatisch

**Beta veröffentlichen:** Genauso, nur mit Bindestrich in der Versionsnummer, z. B. `1.3.0-beta.1`, `1.3.0-beta.2` … Solche Tags werden als *Pre-release* veröffentlicht (mit Beta-Hinweis in den Release-Notes) und nur von Apps im Update-Kanal **Beta** geladen. Der Changelog-Eintrag gehört unter die kommende Version (`"1.3.0"`); Betas zeigen ihn automatisch an.

**Handy-App lokal entwickeln:**
```bash
cd webapp
npm install
npm run dev
```
Eine Test-APK ohne Release baut der Workflow **Android APK** (Actions → *Run workflow*); die APK liegt danach unter *Artifacts*.

**Android-Signierung:** Die APK wird mit einem festen Schlüssel signiert, der als GitHub-Secret hinterlegt ist (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD`). Eingerichtet wird er einmalig mit
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-android-signing.ps1
```
Das Skript installiert bei Bedarf Java, erzeugt den Schlüssel außerhalb des Projekts und setzt die Secrets. Schlüsseldatei und Passwort sicher aufbewahren – ohne sie lassen sich keine Updates mehr über die installierte App installieren. Fehlen die Secrets, baut der Workflow eine Debug-APK mit wechselndem Schlüssel. Die `versionCode` der APK ist die fortlaufende Workflow-Nummer, `versionName` die Version aus `package.json`.

**Lokalen Installer bauen (nur Windows, ohne GitHub-Release):**
```bash
npm run dist
# → dist/Stromplaner Setup x.x.x.exe
```

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
BoxType:    { id, name, feedConnector, outlets[], rcds[] }
Outlet:     { id, label, connector, amp, phase, breaker, char, protection, rcdId, rcdMa?, mcSlots? }
RCD:        { id, label, amp, mA, poles }
Instance:   { id, typeId, name, parentId, parentOutletId, mainConnectionId }
Placement:  { id, instanceId, outletId, mcSlot, loadId }
Load:       { id, name, watt, threePhase }
```

### Connector-Typen
`CEE16` · `CEE32` · `CEE63` · `CEE125` · `CEE16_1` · `CEE32_1` · `PL200` · `PL400` · `PL660` · `PL1000` · `MC` · `SCHUKO`

Adapter-Verbindungen sind innerhalb einer Steckerfamilie (CEE3P, CEE1P, PL, MC, SCHUKO) erlaubt und werden im Schaltbild lila hervorgehoben.

---

Kontakt / Fragen: Stromplaner@pm.me
