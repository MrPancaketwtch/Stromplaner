// Rundgänge der Handy-App (Ablauf: app/shared/tour.jsx). aktion.tab(id) wechselt den Tab.
const tab = (id) => (a) => a.tab(id);

export const TOUREN = [
  {
    id: 'ueberblick',
    titel: 'Überblick',
    beschreibung: 'Die Bereiche der App in einer Minute',
    schritte: [
      { titel: 'Willkommen bei Stromplaner', text: 'Ein kurzer Rundgang durch die App. Du findest ihn jederzeit unter „Hilfe“ wieder.' },
      { ziel: '[data-tour="tab-projekt"]', titel: 'Projekt', text: 'Pläne anlegen und wechseln, Projektdaten, Verteiler-Typen und Verbraucher.', vorher: tab('projekt') },
      { ziel: '[data-tour="tab-steckplan"]', titel: 'Steckplan', text: 'Verteiler anlegen, Verbraucher und Unterverteiler an die Steckplätze stecken.' },
      { ziel: '[data-tour="tab-pruefung"]', titel: 'Prüfung', text: 'Die Errichtungsprüfung je Verteiler – Werte außerhalb der Grenzen werden rot.' },
      { ziel: '[data-tour="tab-teilen"]', titel: 'Teilen', text: 'Plan per Bluetooth mit dem PC austauschen, ganz ohne Netzwerk.' },
      { ziel: '[data-tour="tab-sitzung"]', titel: 'Sitzung', text: 'Mit PC und anderen Handys gleichzeitig am selben Plan arbeiten.' },
      { ziel: '[data-tour="tab-hilfe"]', titel: 'Hilfe', text: 'Hier startest du die Rundgänge zu den einzelnen Themen.' },
    ],
  },
  {
    id: 'plan',
    titel: 'Plan anlegen',
    beschreibung: 'Neuer Plan, Projektdaten und Bibliothek',
    schritte: [
      { ziel: '[data-tour="neuer-plan"]', titel: 'Neuer Plan', text: 'Legt einen leeren Plan an – deine bisherigen bleiben in der Liste.', vorher: tab('projekt') },
      { ziel: '[data-tour="planliste"]', titel: 'Deine Pläne', text: 'Antippen öffnet einen Plan, der Papierkorb löscht ihn.' },
      { ziel: '[data-tour="projektdaten"]', titel: 'Projektdaten', text: 'Trag die Veranstaltung ein – der Name steht oben und im Prüfprotokoll.' },
      { ziel: '[data-tour="stromplan-pdf"]', titel: 'Stromplan als PDF', text: 'Der ganze Plan mit Verteilern, Steckungen und Phasenlast – speichern, teilen oder drucken.' },
      { ziel: '[data-tour="bibliothek"]', titel: 'Bibliothek', text: 'Verteiler-Typen und Verbraucher, die das Handy kennt. Neue legst du hier an.' },
      { ziel: '[data-tour="firmenlogo"]', titel: 'Firmenlogo', text: 'Erscheint oben rechts auf jeder Seite des Prüfprotokolls.' },
    ],
  },
  {
    id: 'stecken',
    beispiel: true, // zeigt bei leerem Plan einen Beispielplan
    titel: 'Verteiler stecken',
    beschreibung: 'Verteiler, Verbraucher und Unterverteiler',
    schritte: [
      { ziel: '[data-tour="verteiler-neu"]', titel: 'Verteiler anlegen', text: 'Mit + wählst du einen Typ und gibst dem Verteiler einen Namen.', vorher: tab('steckplan') },
      { ziel: '.inst-card', titel: 'Verteiler öffnen', text: 'Antippen zeigt alle Steckplätze des Verteilers.' },
      { titel: 'Steckplatz antippen', text: 'Dort steckst du Verbraucher – auch neue – oder schließt einen Unterverteiler an.' },
    ],
  },
  {
    id: 'pruefen',
    beispiel: true, // zeigt bei leerem Plan einen Beispielplan
    titel: 'Prüfen und Protokoll',
    beschreibung: 'Messwerte, Unterschrift und PDF',
    schritte: [
      { ziel: '[data-tour="pruefdetails"]', titel: 'Prüfungsdetails', text: 'Prüfer, Datum, Netzform – und deine Unterschrift fürs PDF.', vorher: tab('pruefung') },
      { ziel: '.inst-card', titel: 'Verteiler prüfen', text: 'Antippen und Werte eintragen. „Weiter“ auf der Tastatur springt ins nächste Feld.' },
      { ziel: '[data-tour="pdf-drucken"]', titel: 'PDF speichern oder drucken', text: 'Dasselbe Protokoll wie am PC – im Druckdialog „Als PDF speichern“ wählen.' },
      { ziel: '[data-tour="pdf-teilen"]', titel: 'PDF direkt teilen', text: 'Schnell per Mail oder Messenger verschicken.' },
      { ziel: '[data-tour="an-pc"]', titel: 'An den PC senden', text: 'Ergebnisse per Bluetooth an den PC geben.' },
    ],
  },
  {
    id: 'pc',
    titel: 'Mit dem PC austauschen',
    beschreibung: 'Per Bluetooth, ohne Netzwerk',
    schritte: [
      { ziel: '[data-tour="bt-sichtbar"]', titel: 'Sichtbar machen', text: 'Das Handy wartet dann auf den PC – Bluetooth muss an sein.', vorher: tab('teilen') },
      { titel: 'Am PC verbinden', text: 'Am PC unter Teilen → „Mit Handy verbinden“ dieses Handy wählen. Der PC holt den Plan oder schickt einen hierher – der landet in der Planliste.' },
    ],
  },
  {
    id: 'sitzung',
    titel: 'Gemeinsam arbeiten',
    beschreibung: 'Sitzung beitreten oder starten',
    schritte: [
      { ziel: '[data-tour="sitzung-server"]', titel: 'Planer-Server', text: 'Die Adresse deines Servers, z. B. 192.168.1.10.', vorher: tab('sitzung') },
      { ziel: '[data-tour="sitzung-name"]', titel: 'Dein Name', text: 'So sehen dich die anderen in der Sitzung.' },
      { ziel: '[data-tour="sitzung-laden"]', titel: 'Beitreten', text: 'Zeigt die laufenden Sitzungen – für jede Sitzung entsteht ein eigener Plan.' },
      { ziel: '[data-tour="sitzung-starten"]', titel: 'Selbst starten', text: 'Oder eine Sitzung mit dem Plan vom Handy starten.' },
    ],
  },
];
