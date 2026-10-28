// Beispielplan für die Rundgänge (Desktop und Handy). Wird nur für die Dauer eines Rundgangs geladen;
// danach kommt der eigene Stand zurück. Alle Ids beginnen mit „bsp-“.
const heute = () => new Date().toISOString().slice(0, 10);

const abgang = (id, label, connector, amp, protection, phase, extra = {}) =>
  ({ id, label, connector, amp, protection, breaker: "C", phase, rcdId: null, ...(protection === "RCBO" ? { rcdMa: 30 } : {}), ...extra });

export function beispielplan() {
  const boxTypes = [
    { id: "bsp-hv", name: "Verteiler 63 A", feedConnector: "CEE63", feedAmp: 63, rcds: [], outlets: [
      abgang("o1", "32A-1", "CEE32", 32, "LS", "L1L2L3"),
      abgang("o2", "32A-2", "CEE32", 32, "LS", "L1L2L3"),
      abgang("o3", "16A-1", "CEE16", 16, "LS", "L1L2L3"),
      abgang("o4", "Schuko 1", "SCHUKO", 16, "RCBO", "L1"),
      abgang("o5", "Schuko 2", "SCHUKO", 16, "RCBO", "L2"),
    ] },
    { id: "bsp-uv", name: "Verteiler 32 A", feedConnector: "CEE32", feedAmp: 32, rcds: [], outlets: [
      abgang("o1", "16A-1", "CEE16", 16, "LS", "L1L2L3"),
      abgang("o2", "Schuko 1", "SCHUKO", 16, "RCBO", "L1"),
      abgang("o3", "Schuko 2", "SCHUKO", 16, "RCBO", "L2"),
      abgang("o4", "Schuko 3", "SCHUKO", 16, "RCBO", "L3"),
    ] },
    { id: "bsp-mc", name: "Multicore-Verteiler", feedConnector: "CEE32", feedAmp: 32, rcds: [], outlets: [
      abgang("o1", "Multicore 1", "MC", 16, "RCBO", "L1", { mcSlots: 6 }),
      abgang("o2", "Schuko 1", "SCHUKO", 16, "RCBO", "L2"),
    ] },
  ];
  const loads = [
    { id: "bsp-mh", name: "Moving Head", watt: 600, threePhase: false },
    { id: "bsp-led", name: "LED-Bar", watt: 150, threePhase: false },
    { id: "bsp-pult", name: "Mischpult", watt: 300, threePhase: false },
    { id: "bsp-amp", name: "Endstufe", watt: 1200, threePhase: false },
    { id: "bsp-kuehl", name: "Kühlschrank", watt: 400, threePhase: false },
    { id: "bsp-dimmer", name: "Dimmerrack", watt: 3600, threePhase: true },
  ];
  const instances = [
    { id: "bsp-i1", typeId: "bsp-hv", name: "HV Bühne", parentId: null, parentOutletId: null, mainConnectionId: "bsp-e1" },
    { id: "bsp-i2", typeId: "bsp-mc", name: "UV Licht", parentId: "bsp-i1", parentOutletId: "o1", mainConnectionId: null },
    { id: "bsp-i3", typeId: "bsp-uv", name: "UV Ton", parentId: "bsp-i1", parentOutletId: "o2", mainConnectionId: null },
    { id: "bsp-i4", typeId: "bsp-uv", name: "UV Bar", parentId: "bsp-i1", parentOutletId: "o3", mainConnectionId: null },
  ];
  let n = 0;
  const steck = (instanceId, outletId, loadId, mcSlot = null) => ({ id: `bsp-p${++n}`, instanceId, outletId, mcSlot, loadId });
  const placements = [
    ...[1, 2, 3, 4, 5, 6].map(s => steck("bsp-i2", "o1", s % 2 ? "bsp-mh" : "bsp-led", s)),
    steck("bsp-i2", "o2", "bsp-led"),
    steck("bsp-i3", "o2", "bsp-pult"), steck("bsp-i3", "o3", "bsp-amp"), steck("bsp-i3", "o4", "bsp-amp"),
    steck("bsp-i4", "o2", "bsp-kuehl"), steck("bsp-i4", "o3", "bsp-kuehl"),
    steck("bsp-i1", "o4", "bsp-pult"),
  ];
  const inspResults = {
    "bsp-i1": {
      voltL1N: "231", voltL2N: "229", voltL3N: "232", voltL1L2: "399", voltL2L3: "401", voltL1L3: "400",
      voltL1PE: "230", voltL2PE: "229", voltL3PE: "231", voltNPE: "0.2", phaseRot: "rechts",
      sicht: [true, true, true, true, true, null], bemerkung: "", bemerkungSchwere: "bad",
      outlets: { o4: { rcdIan: "21", rcdT1: "24", zs: "0.62", ik: "370" }, o5: { rcdIan: "19", rcdT1: "310", zs: "0.66", ik: "350" } },
    },
    "bsp-i4": {
      voltL1N: "230", voltL2N: "231", voltL3N: "229", sicht: [true, true, null, null, null, null],
      bemerkung: "Kennzeichnung am Gehäuse fehlt", bemerkungSchwere: "warn", outlets: {},
    },
  };
  return {
    _format: "stromplaner", _version: 4,
    meta: { production: "Beispiel: Stadtfest Musterstadt", creator: "Stromplaner", version: "1", date: heute() },
    mainConns: [{ id: "bsp-e1", name: "Hausanschluss Bühne", amp: 63 }],
    boxTypes, loads, instances, placements,
    inspMeta: { inspector: "Max Muster", date: heute(), time: "", equipment: "Installationstester", address: "Marktplatz 1", location: "Bühne", netType: "TN-S" },
    inspResults,
    cableCalcs: [], voltCalcs: [],
    schaltbildLayout: { positions: {}, consumerPositions: {}, annotations: [] },
  };
}
