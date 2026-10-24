// Plan-Übertragung per Bluetooth LE ohne Netzwerk – gemeinsam für Desktop- und Handy-App.
// Das Handy ist die Gegenstelle (Android-Plugin webapp/plugins/bluetooth), der PC verbindet sich per Web Bluetooth.
// Jeder Rahmen: 1 Byte Typ + Nutzdaten. Der Plan wird gzip-komprimiert übertragen.

export const BT_SERVICE = '6e4c0001-7a3b-4f2e-9b1d-5374726f6d70';
export const BT_INFO    = '6e4c0002-7a3b-4f2e-9b1d-5374726f6d70'; // lesen: { name, verteiler, version }
export const BT_TX      = '6e4c0003-7a3b-4f2e-9b1d-5374726f6d70'; // Handy → PC (Benachrichtigungen)
export const BT_RX      = '6e4c0004-7a3b-4f2e-9b1d-5374726f6d70'; // PC → Handy (Schreiben)

export const RAHMEN = { HOLEN: 1, START: 2, DATEN: 3, ENDE: 4, FEHLER: 5 };

export async function packen(obj) {
  const strom = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(strom).arrayBuffer());
}

export async function entpacken(bytes) {
  const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(strom).text());
}

export const zuBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const ausBase64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

// Daten in Rahmen zerlegen: START (Länge als uint32), DATEN …, ENDE
export function rahmenBauen(daten, groesse = 180) {
  const start = new Uint8Array(5);
  start[0] = RAHMEN.START;
  new DataView(start.buffer).setUint32(1, daten.length);
  const rahmen = [start];
  for (let i = 0; i < daten.length; i += groesse - 1) {
    const teil = daten.subarray(i, Math.min(i + groesse - 1, daten.length));
    const r = new Uint8Array(teil.length + 1);
    r[0] = RAHMEN.DATEN;
    r.set(teil, 1);
    rahmen.push(r);
  }
  rahmen.push(new Uint8Array([RAHMEN.ENDE]));
  return rahmen;
}

// Eingehende Rahmen wieder zusammensetzen. rahmen() liefert { fortschritt: [n, gesamt] } | { fertig, daten } | { fehler }
export function empfaenger() {
  let gesamt = 0, n = 0, teile = [];
  return {
    rahmen(b) {
      switch (b[0]) {
        case RAHMEN.START:
          gesamt = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(1);
          n = 0; teile = [];
          return { fortschritt: [0, gesamt] };
        case RAHMEN.DATEN:
          teile.push(b.slice(1));
          n += b.length - 1;
          return { fortschritt: [n, gesamt] };
        case RAHMEN.ENDE: {
          if (n !== gesamt) return { fehler: `Übertragung unvollständig (${n} von ${gesamt} Bytes)` };
          const daten = new Uint8Array(n);
          let o = 0;
          for (const t of teile) { daten.set(t, o); o += t.length; }
          return { fertig: true, daten };
        }
        case RAHMEN.FEHLER:
          return { fehler: new TextDecoder().decode(b.slice(1)) };
        default:
          return {};
      }
    },
  };
}
