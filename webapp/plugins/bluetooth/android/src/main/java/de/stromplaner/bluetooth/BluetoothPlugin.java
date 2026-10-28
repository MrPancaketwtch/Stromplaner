package de.stromplaner.bluetooth;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothStatusCodes;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Bluetooth-LE-Gegenstelle für den Planaustausch mit der Stromplaner-Desktop-App ohne Netzwerk.
 * Das Handy macht sich sichtbar, der PC verbindet sich, holt den bereitgestellten Plan (HOLEN)
 * oder schreibt einen Plan hierher (START/DATEN/ENDE). Protokoll: app/shared/bt-protokoll.js
 */
@CapacitorPlugin(
    name = "StromplanerBluetooth",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class BluetoothPlugin extends Plugin {

    private static final UUID SERVICE = UUID.fromString("6e4c0001-7a3b-4f2e-9b1d-5374726f6d70");
    private static final UUID INFO    = UUID.fromString("6e4c0002-7a3b-4f2e-9b1d-5374726f6d70");
    private static final UUID TX      = UUID.fromString("6e4c0003-7a3b-4f2e-9b1d-5374726f6d70");
    private static final UUID RX      = UUID.fromString("6e4c0004-7a3b-4f2e-9b1d-5374726f6d70");
    private static final UUID CCCD    = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static final byte HOLEN = 1, START = 2, DATEN = 3, ENDE = 4, FEHLER = 5;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private BluetoothGattServer server;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothGattCharacteristic tx;

    private byte[] bereit = null;                       // gzip-Plan, den der PC holen kann
    private byte[] info = "{}".getBytes(StandardCharsets.UTF_8);
    private final Map<String, Integer> mtu = new HashMap<>();
    private final Map<String, ByteArrayOutputStream> langeSchreibvorgaenge = new HashMap<>();
    private ByteArrayOutputStream empfang = null;
    private int erwartet = 0;
    private final ArrayDeque<byte[]> sendeschlange = new ArrayDeque<>();
    private BluetoothDevice sendeziel = null;
    private int fehlversuche = 0;
    private boolean ohneNamen = false;

    /* ── Von JavaScript ──────────────────────────────────────────────────── */

    @PluginMethod
    public void starten(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            requestPermissionForAlias("bluetooth", call, "nachErlaubnis");
            return;
        }
        starteIntern(call);
    }

    @PermissionCallback
    private void nachErlaubnis(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) {
            call.reject("Ohne Bluetooth-Berechtigung („Geräte in der Nähe“) geht es nicht.");
            return;
        }
        starteIntern(call);
    }

    @PluginMethod
    public void bereitstellen(PluginCall call) {
        String daten = call.getString("daten");
        String text = call.getString("info", "{}");
        synchronized (this) {
            bereit = daten == null ? null : Base64.decode(daten, Base64.DEFAULT);
            info = text.getBytes(StandardCharsets.UTF_8);
        }
        call.resolve();
    }

    @PluginMethod
    public void stoppen(PluginCall call) {
        stoppeIntern();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stoppeIntern();
    }

    /* ── Gegenstelle starten / beenden ───────────────────────────────────── */

    private void starteIntern(PluginCall call) {
        try {
            BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
            if (adapter == null) { call.reject("Dieses Gerät hat kein Bluetooth."); return; }
            if (!adapter.isEnabled()) { call.reject("Bluetooth ist ausgeschaltet – bitte einschalten."); return; }
            BluetoothLeAdvertiser adv = adapter.getBluetoothLeAdvertiser();
            if (adv == null) { call.reject("Dieses Handy kann sich nicht per Bluetooth LE sichtbar machen."); return; }

            stoppeIntern();
            server = manager.openGattServer(getContext(), gattCallback);
            if (server == null) { call.reject("Bluetooth-Dienst konnte nicht gestartet werden."); return; }

            BluetoothGattService dienst = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
            dienst.addCharacteristic(new BluetoothGattCharacteristic(INFO,
                BluetoothGattCharacteristic.PROPERTY_READ, BluetoothGattCharacteristic.PERMISSION_READ));
            tx = new BluetoothGattCharacteristic(TX, BluetoothGattCharacteristic.PROPERTY_NOTIFY, 0);
            tx.addDescriptor(new BluetoothGattDescriptor(CCCD,
                BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE));
            dienst.addCharacteristic(tx);
            dienst.addCharacteristic(new BluetoothGattCharacteristic(RX,
                BluetoothGattCharacteristic.PROPERTY_WRITE, BluetoothGattCharacteristic.PERMISSION_WRITE));
            server.addService(dienst);

            advertiser = adv;
            ohneNamen = false;
            werben();

            JSObject ret = new JSObject();
            ret.put("name", adapter.getName());
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Bluetooth-Berechtigung fehlt.");
        }
    }

    private void werben() {
        AdvertiseSettings einstellungen = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build();
        AdvertiseData daten = new AdvertiseData.Builder().addServiceUuid(new ParcelUuid(SERVICE)).build();
        // Gerätename in der Scan-Antwort, damit der PC das Handy erkennt (entfällt, wenn der Name zu lang ist)
        AdvertiseData antwort = new AdvertiseData.Builder().setIncludeDeviceName(!ohneNamen).build();
        try {
            advertiser.startAdvertising(einstellungen, daten, antwort, werbeCallback);
        } catch (SecurityException e) {
            melden("fehler", "Bluetooth-Berechtigung fehlt.");
        }
    }

    private final AdvertiseCallback werbeCallback = new AdvertiseCallback() {
        @Override
        public void onStartFailure(int code) {
            if (code == AdvertiseCallback.ADVERTISE_FAILED_DATA_TOO_LARGE && !ohneNamen) {
                ohneNamen = true;
                werben();
                return;
            }
            melden("fehler", "Sichtbar machen fehlgeschlagen (Code " + code + ").");
        }
    };

    private synchronized void stoppeIntern() {
        try {
            if (advertiser != null) advertiser.stopAdvertising(werbeCallback);
            if (server != null) server.close();
        } catch (SecurityException ignored) {
            // ohne Berechtigung gibt es auch nichts zu beenden
        }
        advertiser = null;
        server = null;
        sendeschlange.clear();
        sendeziel = null;
        empfang = null;
        mtu.clear();
        langeSchreibvorgaenge.clear();
    }

    /* ── GATT-Server ─────────────────────────────────────────────────────── */

    private final BluetoothGattServerCallback gattCallback = new BluetoothGattServerCallback() {
        @Override
        public void onConnectionStateChange(BluetoothDevice geraet, int status, int neu) {
            if (neu == BluetoothProfile.STATE_CONNECTED) {
                melden("verbunden", name(geraet));
            } else if (neu == BluetoothProfile.STATE_DISCONNECTED) {
                synchronized (BluetoothPlugin.this) {
                    mtu.remove(geraet.getAddress());
                    langeSchreibvorgaenge.remove(geraet.getAddress());
                }
                melden("getrennt", name(geraet));
            }
        }

        @Override
        public void onMtuChanged(BluetoothDevice geraet, int wert) {
            synchronized (BluetoothPlugin.this) { mtu.put(geraet.getAddress(), wert); }
        }

        @Override
        public void onCharacteristicReadRequest(BluetoothDevice geraet, int id, int offset, BluetoothGattCharacteristic ch) {
            if (!INFO.equals(ch.getUuid())) { antworten(geraet, id, BluetoothGatt.GATT_FAILURE, 0, null); return; }
            byte[] v;
            synchronized (BluetoothPlugin.this) { v = info; }
            byte[] teil = offset >= v.length ? new byte[0] : Arrays.copyOfRange(v, offset, v.length);
            antworten(geraet, id, BluetoothGatt.GATT_SUCCESS, offset, teil);
        }

        @Override
        public void onDescriptorReadRequest(BluetoothDevice geraet, int id, int offset, BluetoothGattDescriptor d) {
            antworten(geraet, id, BluetoothGatt.GATT_SUCCESS, 0, BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE);
        }

        @Override
        public void onDescriptorWriteRequest(BluetoothDevice geraet, int id, BluetoothGattDescriptor d,
                                             boolean vorbereitet, boolean antwortNoetig, int offset, byte[] wert) {
            if (antwortNoetig) antworten(geraet, id, BluetoothGatt.GATT_SUCCESS, 0, null);
        }

        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice geraet, int id, BluetoothGattCharacteristic ch,
                                                 boolean vorbereitet, boolean antwortNoetig, int offset, byte[] wert) {
            if (!RX.equals(ch.getUuid())) {
                if (antwortNoetig) antworten(geraet, id, BluetoothGatt.GATT_FAILURE, 0, null);
                return;
            }
            if (vorbereitet) {
                // Langer Schreibvorgang (Wert größer als die MTU): sammeln bis onExecuteWrite
                synchronized (BluetoothPlugin.this) {
                    ByteArrayOutputStream puffer = langeSchreibvorgaenge.get(geraet.getAddress());
                    if (puffer == null) { puffer = new ByteArrayOutputStream(); langeSchreibvorgaenge.put(geraet.getAddress(), puffer); }
                    puffer.write(wert, 0, wert.length);
                }
                if (antwortNoetig) antworten(geraet, id, BluetoothGatt.GATT_SUCCESS, offset, wert);
                return;
            }
            if (antwortNoetig) antworten(geraet, id, BluetoothGatt.GATT_SUCCESS, 0, null);
            verarbeiten(geraet, wert);
        }

        @Override
        public void onExecuteWrite(BluetoothDevice geraet, int id, boolean ausfuehren) {
            ByteArrayOutputStream puffer;
            synchronized (BluetoothPlugin.this) { puffer = langeSchreibvorgaenge.remove(geraet.getAddress()); }
            antworten(geraet, id, BluetoothGatt.GATT_SUCCESS, 0, null);
            if (ausfuehren && puffer != null) verarbeiten(geraet, puffer.toByteArray());
        }

        @Override
        public void onNotificationSent(BluetoothDevice geraet, int status) {
            naechsterRahmen();
        }
    };

    private void antworten(BluetoothDevice geraet, int id, int status, int offset, byte[] wert) {
        try {
            if (server != null) server.sendResponse(geraet, id, status, offset, wert);
        } catch (SecurityException ignored) {
            // Berechtigung inzwischen entzogen
        }
    }

    /* ── Protokoll ───────────────────────────────────────────────────────── */

    private synchronized void verarbeiten(BluetoothDevice geraet, byte[] v) {
        if (v == null || v.length == 0) return;
        switch (v[0]) {
            case HOLEN:
                senden(geraet);
                break;
            case START:
                if (v.length < 5) return;
                erwartet = ByteBuffer.wrap(v, 1, 4).getInt();
                empfang = new ByteArrayOutputStream();
                break;
            case DATEN:
                if (empfang != null) empfang.write(v, 1, v.length - 1);
                break;
            case ENDE:
                if (empfang == null) return;
                byte[] daten = empfang.toByteArray();
                empfang = null;
                if (daten.length != erwartet) {
                    melden("fehler", "Übertragung vom PC unvollständig – bitte erneut senden.");
                    return;
                }
                JSObject o = new JSObject();
                o.put("geraet", name(geraet));
                o.put("daten", Base64.encodeToString(daten, Base64.NO_WRAP));
                notifyListeners("empfangen", o);
                break;
            default:
                break;
        }
    }

    private synchronized void senden(BluetoothDevice geraet) {
        fehlversuche = 0;
        sendeschlange.clear();
        sendeziel = geraet;
        if (bereit == null) {
            byte[] text = "Auf dem Handy ist noch kein Plan bereit.".getBytes(StandardCharsets.UTF_8);
            byte[] r = new byte[text.length + 1];
            r[0] = FEHLER;
            System.arraycopy(text, 0, r, 1, text.length);
            sendeschlange.add(r);
        } else {
            Integer m = mtu.get(geraet.getAddress());
            // MTU - 3 Bytes passen in eine Benachrichtigung, aber nie mehr als 512 (GATT-Grenze). Windows handelt
            // oft MTU 525–527 aus – 244 Bytes passen zudem in ein einzelnes Funkpaket und laufen am zuverlässigsten.
            int nutzlast = Math.min(244, Math.max(20, (m == null ? 23 : m) - 3)) - 1;
            sendeschlange.add(ByteBuffer.allocate(5).put(START).putInt(bereit.length).array());
            for (int i = 0; i < bereit.length; i += nutzlast) {
                int n = Math.min(nutzlast, bereit.length - i);
                byte[] r = new byte[n + 1];
                r[0] = DATEN;
                System.arraycopy(bereit, i, r, 1, n);
                sendeschlange.add(r);
            }
            sendeschlange.add(new byte[] { ENDE });
        }
        naechsterRahmen();
    }

    // Immer nur ein Rahmen unterwegs: der nächste folgt in onNotificationSent
    private synchronized void naechsterRahmen() {
        if (server == null || tx == null || sendeziel == null) return;
        byte[] r = sendeschlange.poll();
        if (r == null) return;
        boolean ok;
        String code;
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                int status = server.notifyCharacteristicChanged(sendeziel, tx, false, r);
                ok = status == BluetoothStatusCodes.SUCCESS;
                code = String.valueOf(status);
            } else {
                tx.setValue(r);
                ok = server.notifyCharacteristicChanged(sendeziel, tx, false);
                code = "false";
            }
        } catch (SecurityException e) {
            ok = false;
            code = "Berechtigung";
        }
        if (!ok) {
            // Puffer voll – kurz warten und denselben Rahmen erneut senden; nach ~5 s aufgeben (Verbindung weg)
            if (++fehlversuche > 200) {
                sendeschlange.clear();
                fehlversuche = 0;
                melden("fehler", "Senden an den PC abgebrochen (Code " + code + ", Paket " + r.length + " Bytes).");
                return;
            }
            sendeschlange.addFirst(r);
            handler.postDelayed(this::naechsterRahmen, 25);
            return;
        }
        fehlversuche = 0;
        if (r.length == 1 && r[0] == ENDE) melden("gesendet", name(sendeziel));
    }

    /* ── Hilfen ──────────────────────────────────────────────────────────── */

    private String name(BluetoothDevice geraet) {
        try {
            String n = geraet.getName();
            return n != null && !n.isEmpty() ? n : geraet.getAddress();
        } catch (SecurityException e) {
            return "PC";
        }
    }

    private void melden(String ereignis, String text) {
        JSObject o = new JSObject();
        o.put(ereignis.equals("fehler") ? "meldung" : "geraet", text);
        notifyListeners(ereignis, o);
    }
}
