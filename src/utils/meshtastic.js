/**
 * meshtastic.js — Meshtastic BLE integration for off-grid position sharing.
 * Connects to Meshtastic mesh radios over BLE and exchanges position packets.
 * No network calls — all communication is local BLE.
 */

let BleManager = null;
try {
  const blePlx = require('react-native-ble-plx');
  BleManager = blePlx.BleManager;
} catch (e) {
  // BLE module unavailable — mesh features degrade gracefully
}

// ─── Meshtastic BLE Protocol Constants ────────────────────────────────────────
const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
const FROMRADIO_UUID = '2c55e69e-4993-11ed-b878-0242ac120002';
const TORADIO_UUID   = '2c55e69e-4993-11ed-b878-0242ac120003';

// Meshtastic portnum for position packets
const PORTNUM_POSITION = 3;

// ─── Connection States ────────────────────────────────────────────────────────
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  SCANNING: 'scanning',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
};

// ─── Module State ─────────────────────────────────────────────────────────────
let manager = null;
let connectedDevice = null;
let connectionState = CONNECTION_STATES.DISCONNECTED;
let stateListeners = [];
let positionListeners = [];
let monitorSubscription = null;
let reconnectTimer = null;
let lastConnectedDeviceId = null;

function notifyStateChange(newState) {
  connectionState = newState;
  stateListeners.forEach(fn => { try { fn(newState); } catch {} });
}

function getManager() {
  if (!manager && BleManager) {
    manager = new BleManager();
  }
  return manager;
}

// ─── Position Encoding/Decoding ───────────────────────────────────────────────
// Simple binary encoding: 4 bytes lat (int32 * 1e7), 4 bytes lon (int32 * 1e7),
// 4 bytes alt (int32 cm), 4 bytes nodeId (uint32), 8 bytes timestamp (uint64 ms)
// Total: 24 bytes

/**
 * Encode lat/lon/alt into a binary position packet.
 * @param {number} lat — latitude in decimal degrees
 * @param {number} lon — longitude in decimal degrees
 * @param {number} alt — altitude in meters (can be null)
 * @returns {Uint8Array} 24-byte encoded position
 */
export function encodePosition(lat, lon, alt) {
  const buf = new ArrayBuffer(24);
  const view = new DataView(buf);
  view.setInt32(0, Math.round(lat * 1e7), true);
  view.setInt32(4, Math.round(lon * 1e7), true);
  view.setInt32(8, Math.round((alt || 0) * 100), true); // cm
  view.setUint32(12, 0, true); // nodeId placeholder (set by radio)
  // timestamp as two uint32s (little-endian)
  const ts = Date.now();
  view.setUint32(16, ts & 0xFFFFFFFF, true);
  view.setUint32(20, Math.floor(ts / 0x100000000) & 0xFFFFFFFF, true);
  return new Uint8Array(buf);
}

/**
 * Decode a binary position packet.
 * @param {Uint8Array|ArrayBuffer} data — raw bytes (24+ bytes expected)
 * @returns {{ lat: number, lon: number, altitude: number, nodeId: number, timestamp: number }|null}
 */
export function decodePosition(data) {
  try {
    let bytes;
    if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else if (typeof data === 'string') {
      // Base64 decode
      bytes = base64ToBytes(data);
    } else {
      return null;
    }

    if (bytes.length < 24) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const lat = view.getInt32(0, true) / 1e7;
    const lon = view.getInt32(4, true) / 1e7;
    const altCm = view.getInt32(8, true);
    const nodeId = view.getUint32(12, true);
    const tsLow = view.getUint32(16, true);
    const tsHigh = view.getUint32(20, true);
    const timestamp = tsHigh * 0x100000000 + tsLow;

    // Sanity checks
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

    return {
      lat,
      lon,
      altitude: altCm / 100,
      nodeId,
      timestamp,
    };
  } catch {
    return null;
  }
}

// ─── Base64 Helpers ───────────────────────────────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64) {
  const str = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = str.length;
  const bytes = new Uint8Array(Math.floor(len * 3 / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64.indexOf(str[i]);
    const b = B64.indexOf(str[i + 1]);
    const c = B64.indexOf(str[i + 2]);
    const d = B64.indexOf(str[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c >= 0) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.slice(0, p);
}

function bytesToBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] || 0;
    const c = bytes[i + 2] || 0;
    result += B64[a >> 2];
    result += B64[((a & 3) << 4) | (b >> 4)];
    result += (i + 1 < bytes.length) ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    result += (i + 2 < bytes.length) ? B64[c & 63] : '=';
  }
  return result;
}

// ─── Wrap position in a simple Meshtastic-style packet ────────────────────────
function wrapPositionPacket(posBytes) {
  // Header: 1 byte portnum + 1 byte payload length + payload
  const packet = new Uint8Array(2 + posBytes.length);
  packet[0] = PORTNUM_POSITION;
  packet[1] = posBytes.length;
  packet.set(posBytes, 2);
  return packet;
}

function unwrapPacket(bytes) {
  if (!bytes || bytes.length < 2) return null;
  const portnum = bytes[0];
  const len = bytes[1];
  if (portnum !== PORTNUM_POSITION) return null;
  if (bytes.length < 2 + len) return null;
  return bytes.slice(2, 2 + len);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan for nearby Meshtastic devices.
 * @returns {Promise<Array<{id: string, name: string, rssi: number}>>}
 */
export async function scanForDevices() {
  const mgr = getManager();
  if (!mgr) throw new Error('BLE not available');

  notifyStateChange(CONNECTION_STATES.SCANNING);
  const devices = [];
  const seen = new Set();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { mgr.stopDeviceScan(); } catch {}
      notifyStateChange(connectedDevice ? CONNECTION_STATES.CONNECTED : CONNECTION_STATES.DISCONNECTED);
      resolve(devices);
    }, 8000);

    try {
      mgr.startDeviceScan(
        [MESHTASTIC_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            try { mgr.stopDeviceScan(); } catch {}
            notifyStateChange(connectedDevice ? CONNECTION_STATES.CONNECTED : CONNECTION_STATES.DISCONNECTED);
            reject(error);
            return;
          }
          if (device && !seen.has(device.id)) {
            seen.add(device.id);
            devices.push({
              id: device.id,
              name: device.name || device.localName || 'Meshtastic',
              rssi: device.rssi || -100,
            });
          }
        }
      );
    } catch (err) {
      clearTimeout(timeout);
      notifyStateChange(connectedDevice ? CONNECTION_STATES.CONNECTED : CONNECTION_STATES.DISCONNECTED);
      reject(err);
    }
  });
}

/**
 * Connect to a Meshtastic radio via BLE.
 * @param {string} deviceId
 * @returns {Promise<{id: string, name: string}>}
 */
export async function connectToDevice(deviceId) {
  const mgr = getManager();
  if (!mgr) throw new Error('BLE not available');

  // Stop any active scan
  try { mgr.stopDeviceScan(); } catch {}
  // Disconnect existing
  if (connectedDevice) {
    try { await connectedDevice.cancelConnection(); } catch {}
    connectedDevice = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  notifyStateChange(CONNECTION_STATES.CONNECTING);
  lastConnectedDeviceId = deviceId;

  try {
    const device = await mgr.connectToDevice(deviceId, {
      requestMTU: 512,
      timeout: 10000,
    });

    await device.discoverAllServicesAndCharacteristics();
    connectedDevice = device;
    notifyStateChange(CONNECTION_STATES.CONNECTED);

    // Monitor fromRadio for incoming position packets
    startMonitoring(device);

    // Monitor disconnect for auto-reconnect
    mgr.onDeviceDisconnected(deviceId, () => {
      connectedDevice = null;
      if (monitorSubscription) {
        try { monitorSubscription.remove(); } catch {}
        monitorSubscription = null;
      }
      notifyStateChange(CONNECTION_STATES.DISCONNECTED);
      scheduleReconnect();
    });

    return { id: device.id, name: device.name || device.localName || 'Meshtastic' };
  } catch (err) {
    connectedDevice = null;
    notifyStateChange(CONNECTION_STATES.DISCONNECTED);
    throw err;
  }
}

/**
 * Disconnect from the current device.
 */
export async function disconnect() {
  lastConnectedDeviceId = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (monitorSubscription) {
    try { monitorSubscription.remove(); } catch {}
    monitorSubscription = null;
  }
  if (connectedDevice) {
    try { await connectedDevice.cancelConnection(); } catch {}
    connectedDevice = null;
  }
  notifyStateChange(CONNECTION_STATES.DISCONNECTED);
}

/**
 * Send a position to the mesh network.
 */
export async function sendPosition(lat, lon, altitude) {
  if (!connectedDevice) throw new Error('Not connected');

  const posBytes = encodePosition(lat, lon, altitude);
  const packet = wrapPositionPacket(posBytes);
  const b64 = bytesToBase64(packet);

  await connectedDevice.writeCharacteristicWithResponseForService(
    MESHTASTIC_SERVICE_UUID,
    TORADIO_UUID,
    b64,
  );
}

/**
 * Register callback for incoming position packets.
 * @param {function} callback — called with decoded position object
 * @returns {function} unsubscribe function
 */
export function onPositionReceived(callback) {
  positionListeners.push(callback);
  return () => {
    positionListeners = positionListeners.filter(fn => fn !== callback);
  };
}

/**
 * Register callback for connection state changes.
 * @param {function} callback — called with CONNECTION_STATES value
 * @returns {function} unsubscribe function
 */
export function onStateChange(callback) {
  stateListeners.push(callback);
  return () => {
    stateListeners = stateListeners.filter(fn => fn !== callback);
  };
}

/**
 * Get current connection state.
 */
export function getConnectionState() {
  return connectionState;
}

/**
 * Get connected device info.
 */
export function getConnectedDevice() {
  if (!connectedDevice) return null;
  return { id: connectedDevice.id, name: connectedDevice.name || connectedDevice.localName || 'Meshtastic' };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function startMonitoring(device) {
  if (monitorSubscription) {
    try { monitorSubscription.remove(); } catch {}
  }

  monitorSubscription = device.monitorCharacteristicForService(
    MESHTASTIC_SERVICE_UUID,
    FROMRADIO_UUID,
    (error, characteristic) => {
      if (error) return;
      if (!characteristic?.value) return;

      try {
        const raw = base64ToBytes(characteristic.value);
        const payload = unwrapPacket(raw);
        if (!payload) return;

        const pos = decodePosition(payload);
        if (!pos) return;

        positionListeners.forEach(fn => {
          try { fn(pos); } catch {}
        });
      } catch {}
    }
  );
}

function scheduleReconnect() {
  if (!lastConnectedDeviceId) return;
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (connectedDevice || !lastConnectedDeviceId) return;

    try {
      await connectToDevice(lastConnectedDeviceId);
    } catch {
      // Retry again after delay
      scheduleReconnect();
    }
  }, 5000);
}

/**
 * Clean up BLE manager — call on app shutdown.
 */
export function destroy() {
  disconnect();
  if (manager) {
    try { manager.destroy(); } catch {}
    manager = null;
  }
  stateListeners = [];
  positionListeners = [];
}
