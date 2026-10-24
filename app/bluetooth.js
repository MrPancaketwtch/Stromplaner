// PC-Seite der Bluetooth-Übertragung (Web Bluetooth). Das Handy muss in der Stromplaner-App
// unter „Teilen“ für den PC sichtbar sein; die Geräteauswahl liefert Electron über select-bluetooth-device.
import { BT_SERVICE, BT_INFO, BT_TX, BT_RX, RAHMEN, packen, entpacken, rahmenBauen, empfaenger } from "./shared/bt-protokoll.js";

export const btVerfuegbar = () => !!navigator.bluetooth;

export async function btVerbinden() {
  const geraet = await navigator.bluetooth.requestDevice({ filters: [{ services: [BT_SERVICE] }] });
  const gatt = await geraet.gatt.connect();
  const dienst = await gatt.getPrimaryService(BT_SERVICE);
  const [info, tx, rx] = await Promise.all([BT_INFO, BT_TX, BT_RX].map(u => dienst.getCharacteristic(u)));
  return { geraet, info, tx, rx, trennen: () => { if (geraet.gatt.connected) geraet.gatt.disconnect(); } };
}

export async function btInfo(v) {
  const d = await v.info.readValue();
  try { return JSON.parse(new TextDecoder().decode(d)); } catch { return {}; }
}

// Plan vom Handy holen; fortschritt(n, gesamt) in Bytes
export function btHolen(v, fortschritt) {
  return new Promise((ok, fehler) => {
    const e = empfaenger();
    let timer = null, fertig = false;
    const ende = (f, x) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      v.tx.removeEventListener("characteristicvaluechanged", hoeren);
      v.tx.stopNotifications().catch(() => {});
      f(x);
    };
    const wach = () => { clearTimeout(timer); timer = setTimeout(() => ende(fehler, new Error("Das Handy antwortet nicht mehr.")), 20000); };
    const hoeren = (ev) => {
      wach();
      const dv = ev.target.value;
      const r = e.rahmen(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
      if (r.fortschritt) fortschritt?.(...r.fortschritt);
      if (r.fehler) ende(fehler, new Error(r.fehler));
      if (r.fertig) entpacken(r.daten).then(p => ende(ok, p), err => ende(fehler, err));
    };
    v.tx.addEventListener("characteristicvaluechanged", hoeren);
    v.tx.startNotifications()
      .then(() => { wach(); return v.rx.writeValueWithResponse(new Uint8Array([RAHMEN.HOLEN])); })
      .catch(err => ende(fehler, err));
  });
}

// Plan ans Handy senden; fortschritt(gesendeteRahmen, alleRahmen)
export async function btSenden(v, plan, fortschritt) {
  const rahmen = rahmenBauen(await packen(plan));
  for (let i = 0; i < rahmen.length; i++) {
    await v.rx.writeValueWithResponse(rahmen[i]);
    fortschritt?.(i + 1, rahmen.length);
  }
}
