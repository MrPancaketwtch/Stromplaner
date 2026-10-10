import { registerPlugin } from '@capacitor/core';

// Nur in der Android-App vorhanden; im Browser druckt pdf.js selbst über ein iframe
export const Druck = registerPlugin('Druck');
