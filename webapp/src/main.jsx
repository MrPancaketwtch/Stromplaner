import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.jsx';
import './index.css';

// Service Worker nur für die Web-App (offline nutzbar). In der Android-App kommen die Dateien aus der APK;
// ein Service Worker würde dort nach einem Update erst die alte, zwischengespeicherte Oberfläche zeigen.
if ('serviceWorker' in navigator) {
  if (Capacitor.isNativePlatform()) {
    navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (!regs.length) return;
      await Promise.all(regs.map(r => r.unregister()));
      if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
      // Einmal neu laden, damit sicher die Dateien der installierten APK laufen
      window.location.reload();
    }).catch(() => {});
  } else {
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
