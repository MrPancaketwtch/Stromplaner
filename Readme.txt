========================================================================
  STROMPLANER – Drehstrom-Planung für Veranstaltungen
  LIESMICH / README  |  Version 3
========================================================================

Dieses Tool hilft beim Planen der Stromverteilung bei Veranstaltungen.
Man legt fest, welche Unterverteilungen (Kästen) verwendet werden, wie
sie miteinander verbunden (aufgesteckt) sind, und welcher Verbraucher
auf welchem Steckplatz landet. Das Tool berechnet automatisch die Last
pro Phase (L1/L2/L3) je Kasten und summiert alles bis zum Hausan-
schluss. Zusätzlich gibt es ein Blockschaltbild der gesamten Kaskade.


------------------------------------------------------------------------
  ORDNERSTRUKTUR
------------------------------------------------------------------------

[Das Tool]
   Enthält "Stromplaner.html" – das eigentliche Programm.
   Diese eine Datei ist alles, was man zum Arbeiten braucht.
   Einfach per Doppelklick im Browser öffnen (Chrome, Firefox, Edge).
   Kein Internet erforderlich. Alles läuft lokal auf dem Gerät.

[NDR Standardeinstellungen]
   Enthält die Standard-Datei (.json) mit allen fertig eingerichteten
   Kästen und Verbrauchern.
   → Beim Start des Tools laden, um mit dem richtigen Stand anzufangen.
   → Diese Datei ist die "Vorlage". Mit dem Knopf "⭐ Als Standard" im
     Tool kann eine aktualisierte Version gespeichert werden, z.B. wenn
     neue Geräte ins Sortiment kommen.

[Speicherstände]
   Hier kommen die eigenen Planungen pro Veranstaltung rein (.json).
   Jede Datei kann jederzeit wieder geladen und weiterbearbeitet werden.


------------------------------------------------------------------------
  SCHNELLSTART
------------------------------------------------------------------------

1. "Stromplaner.html" per Doppelklick öffnen.
2. Oben links auf "↥ Laden" klicken und die Standard-Datei aus dem
   Ordner "NDR Standardeinstellungen" auswählen. Damit sind alle
   Kästen und Verbraucher korrekt vorgeladen.
3. Planen (siehe Ablauf unten).
4. Regelmäßig mit "💾 Speichern" sichern → in "Speicherstände" ablegen.
5. Am Ende "⬇ Excel" oder "🖨 PDF" für den fertigen Plan.


------------------------------------------------------------------------
  ABLAUF IM TOOL (Reiter oben)
------------------------------------------------------------------------

1 · KONFIGURATION
   – Produktionsname, Ersteller, Version, Datum eintragen.
   – Hausanschluss definieren (Bezeichnung + maximaler Strom).
   – Kästen aktivieren: Typ aus dem Dropdown wählen und
     "+ Kasten hinzufügen" klicken.
   – Pro Kasten einstellen, an welchem anderen Kasten er hängt
     und an welchem Abgang ("Kasten 5H hängt an Kasten 3, Abgang 32A-2").
     Kästen ohne Verbindung gelten als Einspeisepunkt (Hauptanschluss).
   – Namen der Kästen können frei umbenannt werden.
   – Überlastete Kästen werden mit ⚠ markiert.

2 · STECKPLAN
   – Pro aktiviertem Kasten ein eigenes Tab (Reiter).
   – Ganz oben: Live-Anzeige der Gesamtlast am Hauptanschluss.
   – Pro Kasten: Phasen-Balken zeigen Eigenlast und Gesamtlast
     (Ampel: grün = ok, orange = über 80%, rot = Überlast).
   – "+ Verbraucher stecken": Verbraucher aus Stammdaten wählen,
     dann Steckplatz wählen. Phase wird automatisch gesetzt.
   – Nur passende Steckplätze werden angezeigt (1-phasige Verbraucher
     sehen nur 1-phasige Abgänge, 3-phasige nur CEE-Rot/Powerlock).

3 · ÜBERSICHT
   – Hauptanschluss mit Gesamtlast aller Phasen.
   – Tabelle aller Kästen mit Status (OK / >80% / ÜBERLAST).

SCHALTBILD
   – Baumdarstellung der gesamten Kaskade als Blockschaltbild.
   – Lastwerte (L1/L2/L3) stehen an den Verbindungslinien und
     in den Kästen. Farbkodierung wie im Steckplan.
   – Der Hausanschluss erscheint links, wenn er definiert ist.

KASTEN-TYPEN (Stammdaten)
   – Alle Kasten-Typen mit ihren festen Abgängen (physische Dosen).
   – Jeder Abgang hat: Name, Stecker-Typ, Absicherung (A),
     Phase (fest), Sicherungscharakteristik (B/C/D/K) und
     Schutzart (LS / RCD / RCBO).
   – Vollständig editierbar: Abgänge umbenennen, Werte anpassen,
     neue Abgänge hinzufügen, eigene Kasten-Typen anlegen.
   – Abgangs-Absicherung kann die Einspeisung nicht übersteigen
     (wird blockiert). Beim Aufstecken auf kleinere Abgänge
     erscheint eine Warnung.

VERBRAUCHER (Stammdaten)
   – Liste aller Verbraucher mit Leistung in Watt.
   – Checkbox "3-phasig": Verbraucher liegt auf allen drei Phasen.
     Der eingetragene Wert (W) entspricht der Leistung je Phase;
     der Strom (A/Ph = W / 230) wird auf L1, L2 und L3 kopiert.
   – 1-phasige Verbraucher: Strom = W / 230, auf eine Phase.


------------------------------------------------------------------------
  KNÖPFE IN DER KOPFZEILE
------------------------------------------------------------------------

↥ Laden          Gespeicherten Stand (.json) laden und weiterarbeiten.
💾 Speichern     Aktuellen Stand als .json speichern (in "Speicher-
                 stände" ablegen).
⭐ Als Standard  Aktuelle Kasten-Typen und Verbraucher als neue
                 Standard-Datei speichern. Die heruntergeladene Datei
                 ersetzt die alte Datei in "NDR Standardeinstellungen".
🖨 PDF           Druckbaren Plan öffnen (Browserdruckdialog).
                 Ideal für schnellen Versand aufs Handy o.Ä.
⬇ Excel         Fertigen Plan als .xlsx exportieren (Übersicht,
                 Hauptanschluss, ein Blatt pro Kasten, Verbraucher).
                 Excel-Dateien können NICHT wieder ins Tool geladen
                 werden. Zum Weiterbearbeiten immer .json verwenden.


------------------------------------------------------------------------
  BERECHNUNGSLOGIK
------------------------------------------------------------------------

– Alle Verbraucher sind einphasig (Strom = W / 230 V) oder
  3-phasig (Strom = W / 230 V je Phase, gleicher Wert auf L1, L2, L3).
  Bei 3-phasigen Verbrauchern entspricht der eingetragene Watt-Wert
  der Leistung je Phase (wie in Datenblättern angegeben).
– Phasen bleiben beim Aufstecken erhalten (L1→L1, L2→L2, L3→L3).
– Die Kaskadenberechnung summiert alle aufgesteckten Kästen rekursiv.
– Die Prozentzahl bezieht sich immer auf die Einspeisung des
  jeweiligen Kastens (feedAmp).


------------------------------------------------------------------------
  HINWEIS
------------------------------------------------------------------------

Die Werte sind eine Planungshilfe für die Veranstaltungstechnik.
Die Verantwortung für die tatsächliche Auslegung, Absicherung und
sichere Installation liegt bei der zuständigen Elektrofachkraft.

------------------------------------------------------------------------
  Bei Fragen oder Änderungswünschen: silas.roesler@pm.me
========================================================================
