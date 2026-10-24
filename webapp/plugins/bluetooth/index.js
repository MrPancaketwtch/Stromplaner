import { registerPlugin } from '@capacitor/core';

// Nur in der Android-App vorhanden (Bluetooth-LE-Gegenstelle, siehe app/shared/bt-protokoll.js)
export const StromplanerBluetooth = registerPlugin('StromplanerBluetooth');
