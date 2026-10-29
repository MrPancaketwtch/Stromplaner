# ⚡ Stromplaner

Planungs- und Prüftool für mobile Drehstrom-Verteilanlagen in der Veranstaltungstechnik.

Mit Stromplaner baust du die komplette Stromverteilung einer Produktion auf: Verteiler hängen in einer Kaskade aneinander, Verbraucher werden auf Steckplätze verteilt und die Phasenlasten rechnen sich automatisch mit. Ein Schaltbild zeigt die ganze Topologie. Dazu kommen ein Prüfprotokoll für die Errichtungsprüfung nach DIN VDE 0100-600 und Rechner für Leitungsdimensionierung und Spannungsfall – am PC und als Handy-App direkt am Verteiler.

> **Hinweis:** Stromplaner ist eine Planungs- und Dokumentationshilfe. Auslegung, Absicherung und sichere Installation liegen in der Verantwortung der zuständigen Elektrofachkraft.

**Inhalt**
- [Anleitung](#anleitung) – Installation, Arbeitsablauf, PC-App, Handy-App, Austausch, Sitzungen
- [Entwicklerinfos](#entwicklerinfos) – Aufbau, Berechnungslogik, Build & Release, Dateiformat

---

# Anleitung

## Installation

### PC (Windows und macOS)
Die neueste Version gibt es auf der **[Releases-Seite](https://github.com/MrPancaketwtch/Stromplaner/releases)**:
- **Windows:** `Stromplaner-Setup-x.x.x.exe`
- **macOS (Apple Silicon / M-Serie):** `Stromplaner-x.x.x-arm64.dmg`
- **macOS (Intel):** `Stromplaner-x.x.x.dmg`

> **macOS:** Beim ersten Öffnen warnt macOS „Entwickler nicht verifiziert“. Rechtsklick auf die App → **Öffnen** → **Öffnen** – danach startet sie normal.

### Handy (Android)
Die Handy-App ist für die Arbeit direkt an der Anlage gedacht – draußen ist ein Laptop einfach unhandlich. Zum Planen empfehle ich weiterhin die PC-App, auch wenn beides geht.

- **Google Play:** Wegen einer Vorgabe von Google ist die App dort bisher nur im Early Access. Wenn du mir mit Feedback helfen willst, sie öffentlich zu machen, lade sie dir **[im Play Store](https://play.google.com/store/apps/details?id=de.stromplaner.app)** – danke, dass du dir die Zeit nimmst!
- **APK:** Alternativ `Stromplaner-x.x.x.apk` von der [Releases-Seite](https://github.com/MrPancaketwtch/Stromplaner/releases) aufs Handy laden und öffnen. Android fragt beim ersten Mal, ob Apps aus dieser Quelle installiert werden dürfen – für Browser bzw. Dateimanager erlauben. Für ein Update die neue APK einfach drüberinstallieren; Pläne und Prüfergebnisse bleiben erhalten.
- **Web-App:** Ohne Installation läuft Stromplaner unter **[mrpancaketwtch.github.io/Stromplaner](https://mrpancaketwtch.github.io/Stromplaner/)**. Bluetooth und Sitzungen mit einem `http://`-Server gehen dort nicht – für die Prüfung vor Ort besser die App nehmen.

> **Umstieg von einer alten Testversion** (bis 1.3.0-beta.1): Seit 1.3.0 hat die App die Kennung `de.stromplaner.app`. Android installiert sie deshalb **neben** der alten statt als Update. Offene Prüfergebnisse vorher an den PC senden, dann die alte App deinstallieren.

### Updates
- **Windows:** Updates laden automatisch im Hintergrund. Ist eines bereit, erscheint in der Kopfzeile **Update bereit** – ein Klick startet neu.
- **macOS:** Die App ist nicht mit einem Apple-Entwicklerzertifikat signiert und kann sich deshalb nicht selbst austauschen. Stromplaner zeigt **Update verfügbar** an; **Download-Seite öffnen** führt zum Release. Dort die passende `.dmg` laden und Stromplaner in den Programme-Ordner ziehen – Pläne, Bibliothek und Einstellungen bleiben erhalten.
- **Beta-Versionen:** Unter **Updates** lässt sich der Kanal wählen. **Stabil** (Standard) liefert nur fertige Versionen, **Beta** zusätzlich Vorabversionen zum Testen. Wer zurück auf Stabil schaltet, bleibt auf der installierten Beta, bis eine neuere fertige Version erscheint.

---

## Arbeitsablauf

Beim ersten Start fragt Stromplaner, ob du schon damit gearbeitet hast – mit **Nein, Tutorial ansehen** zeigt dir ein kurzer Rundgang die wichtigsten Stellen. Alle Rundgänge findest du später unter **Anleitung** (PC) bzw. **Hilfe** (Handy).

### 1. Bibliothek aufbauen – vor dem ersten Plan
Bevor du richtig planen kannst, braucht Stromplaner **deine Verteiler-Typen und Verbraucher**. Sie bilden die Bibliothek, aus der du später jede Produktion zusammensetzt – einmal angelegt, stehen sie in allen Plänen zur Verfügung.

- **Verteiler-Typen** (Tab *Verteiler-Typen*): je Modell Name, Einspeisung und alle Abgänge mit Stecker, Absicherung und Schutzart. Stromplaner bringt einige Beispiel-Typen mit – passe sie an deinen Bestand an oder lösche sie.
- **Verbraucher** (Tab *Verbraucher*): deine Geräte mit Leistung in Watt und 1- oder 3-phasig. Diese Liste ist anfangs leer.
- **Oder importieren:** Hat schon jemand eine Bibliothek aufgebaut, übernimmst du sie in beiden Tabs über **Importieren** (Export-Datei oder gespeicherter Plan). Auch beim **Öffnen** eines fremden Plans kannst du dessen Typen und Verbraucher deiner Bibliothek hinzufügen. Zum Ausprobieren gibt es eine Beispiel-Bibliothek: [Standard.json](https://github.com/MrPancaketwtch/Stromplaner/raw/main/app/Standard.json) herunterladen und importieren.

Die Bibliothek wird automatisch gesichert und bleibt erhalten, egal welchen Plan du öffnest.

### 2. Produktion anlegen (Tab *1 · Konfiguration*)
1. **Produktionsdaten:** Name, Ersteller, Version und Datum.
2. **Einspeisepunkte:** woher der Strom kommt, mit maximaler Absicherung.
3. **Verteiler hinzufügen:** Typ wählen, benennen, hinzufügen – und in der Liste festlegen, woran jeder Verteiler hängt (an einem Einspeisepunkt oder am Abgang eines anderen Verteilers).

### 3. Verbraucher stecken (Tab *2 · Steckplan*)
Pro Verteiler steckst du die Verbraucher auf die Abgänge. Die Phasenlast rechnet sofort mit: **grün** bis 80 %, **orange** darüber, **rot** bei Überlast.

### 4. Kontrollieren (*3 · Übersicht* und *Schaltbild*)
Die Übersicht zeigt alle Lasten zusammengefasst, das Schaltbild die ganze Kaskade zum Ausdrucken.

### 5. Vor Ort prüfen (*Errichtungsprüfung*)
Messwerte je Verteiler eintragen – am PC oder mit der Handy-App direkt am Verteiler (siehe [Austausch per Bluetooth](#plan-zwischen-pc-und-handy-austauschen)).

### 6. Sichern und drucken
- **Automatisch:** Der aktuelle Stand wird laufend gespeichert. **Speichern** brauchst du nur, um einen Plan zu archivieren, auf einen anderen Rechner zu bringen oder vor dem nächsten Projekt zu sichern.
- **PDF:** Es gibt **zwei** Exporte – **PDF** in der Kopfzeile für den Stromplan und **Prüfprotokoll PDF** in der Errichtungsprüfung.

---

## Die PC-App

### Kopfzeile
| Knopf | Funktion |
|-------|----------|
| **Logo** | Firmenlogo hochladen oder ersetzen – erscheint in der App und in den PDFs (✕ daneben entfernt es) |
| **Neu** | Neue Planung beginnen – Verteiler-Typen und Verbraucher bleiben erhalten |
| **Öffnen** | Gespeicherten Plan (`.json`) öffnen; bringt er andere Typen oder Verbraucher mit, fragt Stromplaner, ob sie deine Bibliothek **ergänzen** oder **ersetzen** sollen |
| **Zuletzt geöffnet** | Schnellzugriff auf die letzten Pläne |
| **Speichern** | Plan als `.json` sichern |
| **Teilen** | Plan per Bluetooth mit dem Handy austauschen |
| **Sitzung** | Mit anderen gleichzeitig am selben Plan arbeiten; während einer Sitzung zeigt der Knopf Status und Teilnehmerzahl |
| **Changelog** | Was sich in welcher Version geändert hat |
| **Updates** | Updates prüfen, Kanal Stabil/Beta wählen |
| **PDF** | Druckbarer Stromplan |

### Tabs
| Tab | Wofür |
|-----|-------|
| **1 · Konfiguration** | Produktionsdaten, Einspeisepunkte, Verteiler und ihre Verbindungen. Adapter-Verbindungen sind möglich und farblich markiert; überlastete oder unterdimensionierte Verteiler bekommen ein ⚠. |
| **2 · Steckplan** | Verbraucher auf Abgänge stecken, mit Phasenlast je Verteiler. Bei Multicore wählst du zusätzlich den Steckplatz – die Phase ergibt sich daraus. Mehrere gleiche Verbraucher lassen sich auf einmal stecken. |
| **3 · Übersicht** | Einspeisepunkte mit Summenlast, alle Verteiler mit Last, Verbraucher nach Typ und je Verteiler. |
| **Schaltbild** | Die Kaskade als Blockschaltbild mit Steckern, Absicherung und Verbrauchern; Positionen lassen sich verschieben, Notizen ergänzen. Erscheint auch im PDF. |
| **Errichtungsprüfung** | Prüfprotokoll nach DIN VDE 0100-600: Prüfungsdetails, Sichtprüfung, Spannungen, Drehfeld, RCD-Prüfung, Schleifenimpedanz und Kurzschlussstrom je Abgang, Bemerkungen mit Mangel oder Hinweis. Werte außerhalb der Grenzen werden rot. Export als mehrseitiges PDF mit Deckblatt, Mängelliste und Unterschrift. |
| **Verteiler-Typen** | Deine Verteilermodelle mit Abgängen, Absicherung (B/C/D/K), Schutzart (LS / RCBO / ohne) und RCCB-Gruppen; mehrere gleiche Abgänge auf einmal anlegen; Import und Export. |
| **Verbraucher** | Deine Geräte mit Leistung und 1- oder 3-phasig; Import und Export. |
| **Anleitung** | Geführte Rundgänge zu allen Bereichen. Die **?**-Knöpfe an einzelnen Abschnitten starten den passenden Rundgang direkt an dieser Stelle. |
| **Leitungsdimensionierung** · **Spannungsfall** *(orange, ganz rechts)* | Rechner für Leitungsquerschnitt (H07RN-F) und Spannungsfall; beliebig viele benannte Rechnungen, die mit dem Plan gespeichert werden. |

---

## Die Handy-App

| Tab | Wofür |
|-----|-------|
| **Projekt** | Planliste (mehrere Pläne anlegen, wechseln, löschen), Projektdaten, **Stromplan als PDF** (wie am PC, ohne Schaltbild), Bibliothek mit Verteiler-Typen und Verbrauchern, Firmenlogo |
| **Steckplan** | Verteiler anlegen; am Steckplatz Verbraucher stecken (auch neu anlegen) und Unterverteiler anschließen |
| **Prüfung** | Errichtungsprüfung je Verteiler mit denselben Grenzwerten wie am PC. **Nächster ›** springt zum nächsten Verteiler, „Weiter“ auf der Tastatur ins nächste Feld. Unter *Prüfungsdetails* mit dem Finger unterschreiben. **PDF speichern / drucken** erzeugt dasselbe Protokoll wie am PC, **PDF direkt teilen** schickt es sofort per Mail oder Messenger. |
| **Teilen** | Plan per Bluetooth mit dem PC austauschen |
| **Sitzung** | Einer Sitzung beitreten oder selbst eine starten |
| **Hilfe** | Geführte Rundgänge durch die App |

Auch am Handy kommen die Verteiler-Typen und Verbraucher aus der Bibliothek: Das Handy merkt sich alle aus Plänen, die es vom PC bekommen hat oder in denen es in einer Sitzung war. Fehlt etwas, legst du es im Tab **Projekt** oder direkt beim Stecken an.

### Spontan prüfen – nur mit dem Handy
1. **Projekt** → **Neuer Plan**, Veranstaltung eintragen. Deine anderen Pläne bleiben in der Liste.
2. **Steckplan** → **+** → Verteiler-Typ wählen. Fehlt der Typ, über **Neuen Typ anlegen** Name, Einspeisung und Abgänge antippen.
3. Unterverteiler am Steckplatz anschließen oder dort neu anlegen, Verbraucher stecken.
4. **Prüfung** → Werte eintragen, danach das Protokoll als PDF speichern oder teilen.

Firmenlogo und Unterschrift bleiben – wie am PC – nur auf dem jeweiligen Gerät gespeichert.

---

## Plan zwischen PC und Handy austauschen
Per Bluetooth, ganz ohne WLAN, Netzwerk oder Kopplung:

1. **Handy:** **Teilen** → **Für den PC sichtbar machen**. Beim ersten Mal die Berechtigung „Geräte in der Nähe“ erlauben; Bluetooth muss an sein. Alternativ in der **Prüfung** unten **Per Bluetooth an PC senden**.
2. **PC:** **Teilen** → **Mit Handy verbinden** → das Handy in der Liste wählen.
3. **Vom Handy holen:** wahlweise **Nur Prüfergebnisse** (empfohlen – die Planung am PC bleibt, wie sie ist) oder **Ganzen Plan**.
4. **Plan ans Handy senden:** Der Plan landet auf dem Handy als eigener Eintrag in der Planliste.

Der PC braucht Bluetooth LE (Windows 10/11; macOS fragt beim ersten Mal nach der Erlaubnis). Solange das Handy sichtbar ist, holt der PC immer den aktuellen Stand.

---

## Gemeinsam arbeiten (Sitzung)
In einer Sitzung arbeiten mehrere PCs und Handys gleichzeitig am selben Plan – jede Änderung erscheint sofort bei allen, Messwerte vom Handy also direkt am PC. Voraussetzung ist ein erreichbarer [Planer-Server](#planer-server-einrichten) und **dieselbe Stromplaner-Version** auf allen Geräten.

1. **Sitzung** öffnen, Server-Adresse (z. B. `192.168.1.10`), ggf. Server-Token und deinen Namen eintragen.
2. **Sitzung starten:** Namen vergeben, optional einen Sitzungscode – dein aktueller Plan wird zum gemeinsamen Plan. Geht am PC und am Handy.
3. **Beitreten:** Die anderen wählen die Sitzung aus der Liste. Am PC ersetzt der Stand der Sitzung den offenen Plan (vorher speichern, falls nötig); am Handy entsteht ein eigener Plan in der Liste.

**Gut zu wissen**
- Wer in einem Feld tippt, sperrt es kurz für die anderen. Ändern zwei Personen dasselbe Feld kurz nacheinander, gilt die letzte Änderung – die andere Person bekommt einen Hinweis.
- Bricht die Verbindung ab, arbeitest du einfach weiter; die Änderungen werden nachgeschickt.
- **Öffnen** und **Neu** ersetzen in einer Sitzung den Plan für alle (mit Rückfrage).
- **Verlassen:** Du kannst später wieder beitreten, der Plan bleibt bei dir. **Für alle beenden** löscht die Sitzung auf dem Server; alle behalten ihren Stand.
- Die Android-App erreicht Server mit `http://`, die Web-App im Browser nur Server mit `https://`.

### Planer-Server einrichten
Sitzungen laufen über den **[Planer-Server](https://github.com/Nomisimo/Planer-Server)**, den gemeinsamen, selbst betriebenen Server der Planer-Familie (Stromplaner, Netzwerkplaner). Mit Docker:

```bash
git clone --recurse-submodules https://github.com/Nomisimo/Planer-Server.git
cd Planer-Server
mkdir -p data && sudo chown -R 1000:1000 data   # Server läuft im Container als Benutzer „node“ (UID 1000)
docker compose up -d --build
curl http://localhost:3001/health                # → {"ok":true,…}
```

- Ohne den `chown`-Schritt legt Docker unter Linux den Datenordner als `root` an und der Server kann nicht speichern. Unter Docker Desktop (Windows/macOS) ist er nicht nötig.
- Der Server läuft auf Port **3001**. Optional schützt `AUTH_TOKEN` (in der `docker-compose.yml`) den Server; denselben Token trägst du dann in den Apps ein.
- Ohne HTTPS ist der Server nur fürs eigene Netz gedacht – aus dem Internet nur hinter einem Reverse-Proxy mit HTTPS erreichbar machen.

---

Kontakt und Fragen: **Stromplaner@pm.me**

---

# Entwicklerinfos

## Aufbau

```
Stromplaner/
├── app/
│   ├── Stromplaner.jsx       ← Desktop-App (React 18)
│   ├── Stromplaner.html      ← gebündelte App (Ergebnis von scripts/build.js)
│   ├── bluetooth.js          ← PC-Seite der Bluetooth-Übertragung (Web Bluetooth)
│   ├── touren-pc.js          ← Rundgänge der Desktop-App
│   ├── shared/               ← von Desktop und Handy gemeinsam genutzt:
│   │   ├── pruefprotokoll.js ←   Prüfprotokoll als HTML
│   │   ├── stromplan.js      ←   Stromplan als HTML
│   │   ├── bt-protokoll.js   ←   Bluetooth-Protokoll (Rahmen, gzip)
│   │   ├── tour.jsx          ←   Rundgang-Baustein und Willkommensfrage
│   │   └── beispielplan.js   ←   Beispielplan für die Rundgänge
│   ├── sync/                 ← Sitzungen (Planer-Server-Client, auch von der Handy-App genutzt)
│   └── Standard.json         ← Verteiler-Typen & Verbraucher zum Vorladen
├── src/
│   ├── main.js               ← Electron-Hauptprozess (Fenster, Dateien, Updates, Bluetooth-Geräteauswahl)
│   ├── preload.js            ← IPC-Brücke (contextBridge)
│   └── splash.html           ← Startbildschirm
├── webapp/                   ← Handy-App (React + Vite; PWA und per Capacitor Android-App)
│   ├── src/App.jsx           ← Oberfläche
│   ├── src/pdf.js            ← PDF am Handy (Druckdienst bzw. html2canvas + jsPDF)
│   ├── src/touren.js         ← Rundgänge der Handy-App
│   ├── plugins/druck/        ← eigenes Capacitor-Plugin: Drucken über den Android-PrintManager
│   ├── plugins/bluetooth/    ← eigenes Capacitor-Plugin: Bluetooth-LE-Gegenstelle (GATT-Server)
│   ├── public/datenschutz.html
│   └── capacitor.config.json
├── scripts/
│   ├── build.js              ← esbuild → standalone HTML
│   ├── release.bat           ← Version setzen, bauen, taggen, pushen
│   ├── setup-android-signing.ps1
│   └── afterPack.js          ← rcedit-Hook (Icon in die .exe)
├── build/                    ← Icons
├── .github/workflows/
│   ├── release.yml           ← Windows + macOS bei Tag-Push
│   ├── android.yml           ← APK + App-Bundle (bei Tag-Push oder manuell)
│   └── webapp.yml            ← PWA auf GitHub Pages bei Push auf main
├── Speicherstände/           ← eigene Pläne (lokal)
└── package.json              ← Version für alle Apps
```

## Stack
| Komponente | Technologie |
|------------|-------------|
| Desktop-UI | React 18 (JSX), Icons [lucide-react](https://lucide.dev) |
| Build | esbuild → eine einzige HTML-Datei ohne externe Abhängigkeiten |
| Desktop | Electron 33 (NSIS für Windows, DMG für macOS), Updates über electron-updater und GitHub Releases |
| Speichern | localStorage (Autosave, 600 ms entprellt); Bibliothek zusätzlich als `Bibliothek.json` in AppData (`%APPDATA%\Stromplaner\Speicherstände\` bzw. `~/Library/Application Support/Stromplaner/Speicherstände/`) – wird zusammengeführt, nicht ersetzt |
| Schaltbild | SVG mit eigenem Layout (kein D3) |
| Handy-App | React 18 + Vite, Capacitor 8 (Android, API 36), PWA über GitHub Pages; eigene Plugins für Drucken und Bluetooth |
| PC ↔ Handy | Bluetooth LE: Handy als GATT-Server (Plugin), PC per Web Bluetooth; Plan gzip-komprimiert in Rahmen ≤ 244 Bytes |
| Sitzungen | WebSocket zum [Planer-Server](https://github.com/Nomisimo/Planer-Server); `app/sync/sync-client.js` und `ops.js` unverändert aus dem Planer-Server übernommen (Apache 2.0, siehe `app/sync/LICENSE` und `NOTICE`) – Änderungen dort pflegen und hierher kopieren |
| CI/CD | GitHub Actions: Windows, macOS und Android bei Tag-Push, PWA bei Push auf main |

## Berechnungslogik

### Phasen und Last
```
1-phasig:  I = W / 230   → auf die Phase des Abgangs
3-phasig:  I = W / 230   → derselbe Wert auf L1, L2 und L3 (Watt-Angabe = Leistung je Phase)
Multicore: Phase rotiert mit dem Steckplatz: SP 1 = L1, SP 2 = L2, SP 3 = L3, SP 4 = L1 …
```
Die Last eines Verteilers umfasst alle direkt gesteckten Verbraucher plus alle angehängten Unterverteiler (rekursiv). Ampel: ≤ 80 % grün, > 80 % orange, > 100 % rot.

### Errichtungsprüfung – Grenzwerte
- **Spannungen:** L–N und L–PE 207–244 V, L–L 360–424 V, N–PE ≤ 1 V.
- **RCD:** Auslösezeit t_A ≤ 300 ms, Auslösestrom I_Δ zwischen ½ · IΔn und IΔn. RCCB-Gruppen sind eigene Prüfzeilen, RCBO-Abgänge werden einzeln geprüft, Multicore-Abgänge in einzelne Steckplätze aufgeteilt.
- **Schleifenimpedanz ohne RCD:** `Z_s ≤ U₀ / (I_n × k)` mit k = 5 (B), 10 (C), 20 (D), 14 (K). Kurzschlussstrom `I_k ≥ I_n × k`.
- **Mit RCD (RCCB/RCBO):** Theoretisch reicht `U₀ / IΔn ≈ 7,67 Ω` (30 mA). Werte über **2 Ω** deuten in der Praxis aber auf einen schlechten Schutzleiterkontakt hin – Stromplaner nutzt deshalb **2 Ω** als Praxisgrenze.
- **Kaskadierte Unterverteiler:** Die Schleifenimpedanz wächst entlang des Leitungswegs, also gilt `Z_s(Eingang UV) < Z_s(Abgang im UV)`. Die Messung am ungünstigsten Punkt deckt die vorgelagerten Abschnitte mit ab (DIN VDE 0100-600, Abschn. 643). Stromplaner leitet Z_s und I_k am UV-Eingang deshalb aus den Messungen der angeschlossenen Abgänge ab – über beliebig viele Ebenen. Überschreitet der abgeleitete Wert den Grenzwert des Eingangs, lässt sich mit **✎ Nachtragen** ein separat gemessener Wert eintragen; das Protokoll dokumentiert Grund und Vergleichswert.

### Leitungsdimensionierung (H07RN-F, DIN VDE 0298-4)
```
I_z = I_basis(Querschnitt) × f_Temperatur × f_Adern × f_Lagen × f_Häufung
Prüfkette: I_B ≤ I_n ≤ I_z
```
Basiswerte frei in Luft: 1,5 mm² → 23 A · 2,5 → 30 A · 4 → 38 A · 6 → 48 A · 10 → 64 A · 16 → 84 A · 25 → 109 A · 35 → 135 A · 50 → 162 A · 70 → 202 A · 95 → 245 A

Korrekturfaktoren (optional): Umgebungstemperatur 10–50 °C · stromführende Adern 2–6 · aufgewickelt 1–3 Lagen · Häufung einlagig oder gebündelt, 1–10 Leitungen.

### Spannungsfall (DIN VDE 0100-520)
```
1-phasig:  ΔU = (2 × I × l × cos φ) / (κ × A)
3-phasig:  ΔU = (√3 × I × l × cos φ) / (κ × A)
κ(Cu) = 56 m/(Ω·mm²)      ΔU% = ΔU / 230 V × 100
```
Ampel: ≤ 3 % grün, ≤ 5 % orange, > 5 % rot. Zusätzlich wird der Mindestquerschnitt für ΔU ≤ 3 % angezeigt.

### Schaltbild
- Verbindungslinien enden exakt am Abgang des übergeordneten Verteilers; die Steckerfamilie steht als Beschriftung daran.
- Fehlt eine Abgangs-Zuordnung oder ist sie veraltet, wird sie über den Eingangsstecker aufgelöst und orange gestrichelt mit ⚠ markiert.
- Adapter-Verbindungen (innerhalb einer Steckerfamilie) sind lila.
- Im PDF wird das SVG auf Seitenbreite skaliert und von dunkel auf hell umgefärbt.

## Build & Release

```bash
npm install          # einmalig
npm run build        # nach Änderungen an app/Stromplaner.jsx → app/Stromplaner.html
npm start            # Desktop-App lokal starten
npm run dist         # lokaler Windows-Installer → dist/
```

**Neue Version:**
1. Changelog in `app/Stromplaner.jsx` (`CHANGELOG`) ergänzen.
2. `scripts\release.bat` ausführen und die Versionsnummer eingeben. Das Skript setzt die Version in `package.json`, baut, committet, taggt und pusht.
3. GitHub Actions baut Windows (`.exe`) und macOS (`.dmg`) und veröffentlicht sie als Release; APK und Play-Store-Bundle (`.aab`) folgen einige Minuten später. Die PWA übernimmt die Version beim Push automatisch.

Alle Apps – PC, Android, PWA – lesen ihre Version aus der `package.json` im Hauptordner. Das ist wichtig, weil der Planer-Server nur gleiche Versionen in eine Sitzung lässt.

**Beta:** Versionsnummer mit Bindestrich, z. B. `1.5.0-beta.1`. Solche Tags werden als *Pre-release* veröffentlicht und nur von Apps im Update-Kanal **Beta** geladen. Der Changelog-Eintrag gehört unter die kommende Version (`"1.5.0"`); Betas zeigen ihn automatisch an.

**Handy-App entwickeln:**
```bash
cd webapp
npm install
npm run dev
```
Eine Test-APK ohne Release baut der Workflow **Android APK** (Actions → *Run workflow*); sie liegt danach unter *Artifacts*.

**Android-Signierung:** APK und App-Bundle werden mit einem festen Schlüssel signiert, der als GitHub-Secret hinterlegt ist (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD`). Einmalig eingerichtet wird er mit
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-android-signing.ps1
```
Das Skript installiert bei Bedarf Java, erzeugt den Schlüssel außerhalb des Projekts und setzt die Secrets. Schlüsseldatei und Passwort sicher aufbewahren – ohne sie lassen sich keine Updates mehr über die installierte App einspielen. Fehlen die Secrets, entsteht eine Debug-APK mit wechselndem Schlüssel. `versionCode` ist die fortlaufende Workflow-Nummer, `versionName` die Version aus `package.json`.

## Dateiformat (Autosave und `.json`)
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
  "voltCalcs": [ ... ],
  "schaltbildLayout": { ... }
}
```

```
BoxType:    { id, name, feedConnector, feedAmp, outlets[], rcds[] }
Outlet:     { id, label, connector, amp, phase, breaker, protection, rcdId, rcdMa?, mcSlots? }
RCD:        { id, label, mA }
Instance:   { id, typeId, name, parentId, parentOutletId, mainConnectionId }
Placement:  { id, instanceId, outletId, mcSlot, loadId }
Load:       { id, name, watt, threePhase }
```

**Stecker:** `CEE16` · `CEE32` · `CEE63` · `CEE125` · `CEE16_1` · `CEE32_1` · `PL200` · `PL400` · `PL660` · `PL1000` · `MC` · `SCHUKO`. Adapter sind innerhalb einer Steckerfamilie erlaubt (CEE 3-polig, CEE 1-polig, Powerlock, Multicore, Schuko).

## Umstieg vom alten Sync-Server
Bis Version 1.2.x gab es einen eigenen Sync-Server (Ordner `server/`). Ab 1.3.0 ersetzen Sitzungen die Funktion „Sync“. Alte Pläne lassen sich in den Planer-Server übernehmen und bleiben dort über `/api/plans` abrufbar:
```bash
# 1. Alten Server stoppen (im Ordner des alten Servers)
docker compose down
# 2. Pläne übernehmen (im Planer-Server-Ordner)
mkdir -p data/stromplaner/plans
cp /pfad/zum/alten/server/data/plans/*.json data/stromplaner/plans/
sudo chown -R 1000:1000 data
# 3. Planer-Server starten – einen bisherigen AUTH_TOKEN vorher in dessen docker-compose.yml eintragen
docker compose up -d --build
```
Server-Adresse und Token in den Apps bleiben gleich.
