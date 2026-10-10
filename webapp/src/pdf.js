// Prüfprotokoll als PDF direkt am Handy – gleiches Layout wie am PC (app/shared/pruefprotokoll.js).
// Die A4-Seiten werden in einem unsichtbaren iframe gerendert, als Bild erfasst und zu einem PDF zusammengesetzt.
import { Capacitor } from '@capacitor/core';
import { pruefprotokollHtml } from '@shared/pruefprotokoll.js';

const SEITE_PX = 794; // Seitenbreite im Protokoll-HTML (A4 bei 96 dpi)

export const pdfDateiname = (plan) => {
  const umlaut = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
  const name = (plan.meta?.production || 'Plan').replace(/[äöüÄÖÜß]/g, c => umlaut[c]).replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Plan';
  return `Errichtungspruefung_${name}_${plan.inspMeta?.date || ''}.pdf`.replace('_.pdf', '.pdf');
};

export async function protokollPdf(plan, { logo = '', signatur = '', fortschritt } = {}) {
  // Große Bibliotheken erst laden, wenn wirklich ein PDF entsteht
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: SEITE_PX + 'px', height: '1200px', border: '0' });
  document.body.appendChild(frame);
  try {
    await new Promise((ok) => { frame.onload = ok; frame.srcdoc = pruefprotokollHtml(plan, { logo, signatur }); });
    const doc = frame.contentDocument;
    // Der Seitenschatten der Bildschirmansicht würde von html2canvas ab Seite 2 über den Inhalt gemalt
    doc.head.appendChild(Object.assign(doc.createElement('style'), { textContent: '.page{box-shadow:none!important}' }));
    await doc.fonts?.ready;
    await Promise.all([...doc.images].map(img => img.decode?.().catch(() => {})));

    const seiten = [...doc.querySelectorAll('.page')];
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < seiten.length; i++) {
      fortschritt?.(i + 1, seiten.length);
      const canvas = await html2canvas(seiten[i], { scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: SEITE_PX });
      // Seite auf A4-Breite; ist sie ausnahmsweise höher als A4, wird sie passend verkleinert
      let w = 210, h = 210 * canvas.height / canvas.width;
      if (h > 297) { w = 297 * canvas.width / canvas.height; h = 297; }
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (210 - w) / 2, 0, w, h);
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

const alsBase64 = (blob) => new Promise((ok, fehler) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = () => fehler(r.error);
  r.readAsDataURL(blob);
});

// Android: über das Teilen-Menü (Mail, Messenger, Drive …); Browser: teilen oder herunterladen
export async function pdfTeilen(blob, dateiname) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: dateiname, data: await alsBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title: dateiname, files: [uri] });
    } catch (e) {
      if (!/cancel/i.test(e?.message || '')) throw e;
    }
    return;
  }
  const datei = new File([blob], dateiname, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [datei] })) {
    try { await navigator.share({ files: [datei], title: dateiname }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: dateiname });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
