// Rundgänge der Desktop-App (Ablauf: app/shared/tour.jsx).
// aktion: { tab(id), teilen(offen), sitzung(offen) } – Abschnitte werden über data-abschnitt="Titel" gefunden.
const tab = (id) => (a) => a.tab(id);
const abschnitt = (titel) => `[data-abschnitt="${titel}"]`;

export const TOUREN_PC = [
  {
    id: "ueberblick",
    titel: "Überblick",
    beschreibung: "Kopfzeile und Arbeitsschritte in einer Minute",
    schritte: [
      { titel: "Willkommen bei Stromplaner", text: "Ein kurzer Rundgang durch die App. Du findest ihn jederzeit unter „Anleitung“ wieder." },
      { ziel: '[data-tour="neu"]', titel: "Neu", text: "Beginnt eine neue Planung – Verteiler-Typen und Verbraucher bleiben erhalten.", vorher: tab("config") },
      { ziel: '[data-tour="oeffnen"]', titel: "Öffnen", text: "Einen gespeicherten Plan öffnen." },
      { ziel: '[data-tour="zuletzt"]', titel: "Zuletzt geöffnet", text: "Schneller Zugriff auf deine letzten Pläne." },
      { ziel: '[data-tour="speichern"]', titel: "Speichern", text: "Den Plan als Datei sichern. Zwischendurch speichert Stromplaner automatisch." },
      { ziel: '[data-tour="teilen"]', titel: "Teilen", text: "Plan per Bluetooth mit der Handy-App austauschen." },
      { ziel: '[data-tour="sitzung"]', titel: "Sitzung", text: "Mit anderen gleichzeitig am selben Plan arbeiten." },
      { ziel: '[data-tour="pdf"]', titel: "PDF", text: "Der druckbare Stromplan." },
      { ziel: '[data-tour="tabs"]', titel: "Die Arbeitsschritte", text: "Von links nach rechts: Konfiguration, Steckplan, Übersicht, Schaltbild, Prüfung – dazu deine Bibliothek." },
      { ziel: '[data-tour="rechner"]', titel: "Rechner", text: "Leitungsdimensionierung und Spannungsfall." },
      { ziel: '[data-tour="tab-help"]', titel: "Anleitung", text: "Hier startest du die Rundgänge zu den einzelnen Themen." },
    ],
  },
  {
    id: "konfiguration",
    beispiel: true, // zeigt bei leerem Plan einen Beispielplan
    titel: "Planung anlegen",
    beschreibung: "Produktion, Einspeisepunkte und Verteiler",
    schritte: [
      { ziel: abschnitt("Produktionsdaten"), titel: "Produktionsdaten", text: "Name, Ersteller und Datum – erscheinen im Plan und im Protokoll.", vorher: tab("config") },
      { id: "einspeisung", ziel: abschnitt("Einspeisepunkte"), titel: "Einspeisepunkte", text: "Woher kommt der Strom? Lege die Einspeisungen mit ihrer Absicherung an.", vorher: tab("config") },
      { id: "verteiler", ziel: abschnitt("Verteiler hinzufügen"), titel: "Verteiler", text: "Typ wählen und hinzufügen. In der Liste legst du fest, woran jeder Verteiler hängt.", vorher: tab("config") },
    ],
  },
  {
    id: "steckplan",
    beispiel: true, // zeigt bei leerem Plan einen Beispielplan
    titel: "Verbraucher stecken",
    beschreibung: "Steckplan und Phasenlast",
    schritte: [
      { ziel: abschnitt("Einspeisepunkte – Gesamtlast"), titel: "Gesamtlast", text: "Auslastung je Einspeisepunkt und Phase auf einen Blick.", vorher: tab("plan") },
      { ziel: '[data-tour="steckplan-auswahl"]', titel: "Verteiler wählen", text: "Jeder Verteiler hat sein eigenes Datenblatt." },
      { ziel: '[data-tour="steckplan-blatt"]', titel: "Stecken", text: "Verbraucher auf die Anschlüsse stecken – die Phasenlast rechnet sofort mit." },
      { ziel: abschnitt("Steckplan"), titel: "Erst Verteiler anschließen", text: "Lege unter „1 · Konfiguration“ Verteiler an und schließe sie an einen Einspeisepunkt oder anderen Verteiler an." },
    ],
  },
  {
    id: "bibliothek",
    titel: "Bibliothek",
    beschreibung: "Verteiler-Typen und Verbraucher",
    schritte: [
      { ziel: abschnitt("Verteiler-Typen"), titel: "Verteiler-Typen", text: "Deine Verteilermodelle mit Anschlüssen und Absicherung – einmal anlegen, in jeder Produktion nutzen.", vorher: tab("boxtypes") },
      { id: "rccb", ziel: '[data-tour="rccb"]', titel: "RCCB-Gruppen", text: "FI-Schutzschalter, die mehrere Anschlüsse gemeinsam schützen.", vorher: tab("boxtypes") },
      { ziel: abschnitt("Verbraucher-Stammdaten"), titel: "Verbraucher", text: "Geräte mit Leistung. 3-phasige werden auf L1–L3 verteilt.", vorher: tab("loads") },
    ],
  },
  {
    id: "uebersicht",
    beispiel: true, // zeigt bei leerem Plan einen Beispielplan
    titel: "Übersicht und Schaltbild",
    beschreibung: "Zusammenfassung und Blockschaltbild",
    schritte: [
      { ziel: abschnitt("Alle Verteiler"), titel: "Übersicht", text: "Alle Verteiler mit Last, dazu die Verbraucher nach Typ und je Verteiler.", vorher: tab("overview") },
      { ziel: abschnitt("Übersicht"), titel: "Übersicht", text: "Sobald Verteiler angelegt sind, siehst du hier alle Lasten und Verbraucher zusammengefasst.", vorher: tab("overview") },
      { ziel: abschnitt("Blockschaltbild"), titel: "Schaltbild", text: "Die Verteilung als Blockschaltbild – Positionen lassen sich verschieben, Notizen ergänzen.", vorher: tab("schematic") },
    ],
  },
  {
    id: "pruefung",
    beispiel: true, // zeigt bei leerem Plan einen Beispielplan
    titel: "Errichtungsprüfung",
    beschreibung: "Messwerte, Unterschrift und Protokoll",
    schritte: [
      { ziel: abschnitt("Prüfungsdetails"), titel: "Prüfungsdetails", text: "Prüfer, Datum, Messgerät und Netzform.", vorher: tab("inspection") },
      { ziel: '[data-tour="unterschrift"]', titel: "Unterschrift", text: "Erscheint im Protokoll über deinem Namen." },
      { ziel: '[data-tour="pruef-verteiler"]', titel: "Je Verteiler prüfen", text: "Sichtprüfung, Spannungen, RCD und Schleifenimpedanz. Werte außerhalb der Grenzen werden rot." },
      { ziel: '[data-tour="pruef-pdf"]', titel: "Prüfprotokoll", text: "Das fertige Protokoll als PDF." },
    ],
  },
  {
    id: "handy",
    titel: "Mit dem Handy austauschen",
    beschreibung: "Per Bluetooth, ohne Netzwerk",
    schritte: [
      { ziel: '[data-tour="teilen"]', titel: "Teilen", text: "Hier verbindest du dich mit der Handy-App." },
      { ziel: '[data-tour="bt-verbinden"]', titel: "Mit Handy verbinden", text: "Am Handy unter „Teilen“ sichtbar machen, dann hier verbinden – keine Kopplung nötig.", vorher: (a) => a.teilen(true) },
      { titel: "Holen oder senden", text: "Vom Handy holst du nur die Prüfergebnisse oder den ganzen Plan. Ein Plan ans Handy landet dort in der Planliste." },
    ],
  },
  {
    id: "sitzung",
    titel: "Gemeinsam arbeiten",
    beschreibung: "Sitzung starten oder beitreten",
    schritte: [
      { ziel: '[data-tour="sitzung"]', titel: "Sitzung", text: "Alle bearbeiten denselben Plan gleichzeitig – PC und Handy." },
      { ziel: '[data-tour="sitzung-server"]', titel: "Planer-Server", text: "Die Adresse deines Servers, z. B. 192.168.1.10.", vorher: (a) => a.sitzung(true) },
      { ziel: '[data-tour="sitzung-laden"]', titel: "Beitreten", text: "Zeigt die laufenden Sitzungen." },
      { ziel: '[data-tour="sitzung-neu"]', titel: "Selbst starten", text: "Dein aktueller Plan wird zum gemeinsamen Plan." },
    ],
  },
  {
    id: "rechner",
    titel: "Rechner",
    beschreibung: "Leitungsdimensionierung und Spannungsfall",
    schritte: [
      { ziel: '[data-tour="rechner"]', titel: "Leitungsdimensionierung", text: "Prüfkette I_B ≤ I_n ≤ I_z nach DIN VDE 0298-4 für H07RN-F.", vorher: (a) => a.tab("dim") },
      { ziel: '[data-tour="rechner-volt"]', titel: "Spannungsfall", text: "Spannungsabfall einer Leitung in Volt und Prozent.", vorher: (a) => a.tab("volt") },
    ],
  },
];

// „?“ an einem Abschnitt startet den passenden Rundgang an dieser Stelle
export const HILFE_ZU_TOUR = {
  hauptanschluesse:    { tour: "konfiguration", schritt: "einspeisung" },
  verteiler:           { tour: "konfiguration", schritt: "verteiler" },
  steckplan:           { tour: "steckplan" },
  rccb:                { tour: "bibliothek", schritt: "rccb" },
  errichtungspruefung: { tour: "pruefung" },
};
