/**
 * meshtastic.js — Meshtastic BLE integration for off-grid position sharing.
 * Connects to Meshtastic mesh radios over BLE and exchanges position packets
 * using the official Meshtastic protobuf protocol.
 *
 * Protocol reference: https://meshtastic.org/docs/development/device/client-api/
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
const TORADIO_UUID   = 'f75c76d2-129e-4dad-a1dd-7866124401e7';
const FROMNUM_UUID   = 'ed9da18c-a800-4f66-a670-aa7547e34453';

// Meshtastic protobuf field/portnum constants
const PORTNUM_POSITION = 3;
const PORTNUM_NODEINFO = 4;

// ─── Connection States ────────────────────────────────────────────────────────
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  SCANNING: 'scanning',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
};

// ─── Shared BLE Manager ──────────────────────────────────────────────────────
// Single instance shared across meshtastic and externalGPS to avoid iOS conflicts
let sharedManager = null;

export function getSharedBleManager() {
  if (!sharedManager && BleManager) {
    sharedManager = new BleManager();
  }
  return sharedManager;
}

export function destroySharedBleManager() {
  if (sharedManager) {
    try { sharedManager.destroy(); } catch {}
    sharedManager = null;
  }
}

// ─── Module State ─────────────────────────────────────────────────────────────
let connectedDevice = null;
let connectionState = CONNECTION_STATES.DISCONNECTED;
let stateListeners = [];
let positionListeners = [];
let fromNumSubscription = null;
let reconnectTimer = null;
let lastConnectedDeviceId = null;
let configId = 0; // increments each connection for startConfig

function notifyStateChange(newState) {
  connectionState = newState;
  stateListeners.forEach(fn => { try { fn(newState); } catch {} });
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

// ─── Minimal Protobuf Encoding/Decoding ──────────────────────────────────────
// Implements just enough protobuf wire format to encode/decode Meshtastic
// Position and ToRadio/FromRadio messages. No external protobuf library needed.

function encodeVarint(value) {
  const bytes = [];
  let v = value >>> 0; // ensure unsigned
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return bytes;
}

function encodeSignedVarint(value) {
  // Protobuf uses ZigZag for sint32: (n << 1) ^ (n >> 31)
  const zigzag = (value << 1) ^ (value >> 31);
  return encodeVarint(zigzag >>> 0);
}

function encodeLengthDelimited(fieldNumber, bytes) {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const len = encodeVarint(bytes.length);
  return [...tag, ...len, ...bytes];
}

function encodeVarintField(fieldNumber, value) {
  if (value === 0) return [];
  const tag = encodeVarint((fieldNumber << 3) | 0);
  return [...tag, ...encodeVarint(value)];
}

function encodeSint32Field(fieldNumber, value) {
  if (value === 0) return [];
  const tag = encodeVarint((fieldNumber << 3) | 0);
  return [...tag, ...encodeSignedVarint(value)];
}

function encodeFixed32Field(fieldNumber, value) {
  if (value === 0) return [];
  const tag = encodeVarint((fieldNumber << 3) | 5);
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, value >>> 0, true);
  return [...tag, ...new Uint8Array(buf)];
}

// Decode a single varint from bytes at offset, returns { value, bytesRead }
function decodeVarint(bytes, offset) {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;
  while (offset + bytesRead < bytes.length) {
    const b = bytes[offset + bytesRead];
    result |= (b & 0x7f) << shift;
    bytesRead++;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, bytesRead };
}

function decodeZigZag(n) {
  return (n >>> 1) ^ -(n & 1);
}

// Parse protobuf fields from bytes — returns array of { fieldNumber, wireType, value }
function parseProtobuf(bytes) {
  const fields = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = decodeVarint(bytes, offset);
    offset += tag.bytesRead;
    const fieldNumber = tag.value >>> 3;
    const wireType = tag.value & 0x07;

    if (wireType === 0) { // varint
      const val = decodeVarint(bytes, offset);
      offset += val.bytesRead;
      fields.push({ fieldNumber, wireType, value: val.value });
    } else if (wireType === 2) { // length-delimited
      const len = decodeVarint(bytes, offset);
      offset += len.bytesRead;
      const data = bytes.slice(offset, offset + len.value);
      offset += len.value;
      fields.push({ fieldNumber, wireType, value: data });
    } else if (wireType === 5) { // fixed32
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
      const val = view.getUint32(0, true);
      offset += 4;
      fields.push({ fieldNumber, wireType, value: val });
    } else if (wireType === 1) { // fixed64
      offset += 8; // skip — we don't use 64-bit fixed fields
    } else {
      break; // unknown wire type, stop parsing
    }
  }
  return fields;
}

// ─── Meshtastic Message Encoding ─────────────────────────────────────────────

/**
 * Encode a Position protobuf message.
 * Position fields: latitude_i (sint32, field 1), longitude_i (sint32, field 2),
 * altitude (sint32, field 3), time (fixed32, field 4)
 */
export function encodePosition(lat, lon, alt) {
  const latI = Math.round(lat * 1e7);
  const lonI = Math.round(lon * 1e7);
  const altM = Math.round(alt || 0);
  const time = Math.floor(Date.now() / 1000);
  return new Uint8Array([
    ...encodeSint32Field(1, latI),
    ...encodeSint32Field(2, lonI),
    ...encodeSint32Field(3, altM),
    ...encodeFixed32Field(4, time),
  ]);
}

/**
 * Decode a Position protobuf message.
 * Returns { lat, lon, altitude, time } or null.
 */
export function decodePosition(bytes) {
  try {
    if (!bytes || bytes.length < 4) return null;
    const fields = parseProtobuf(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    let latI = 0, lonI = 0, altM = 0, time = 0;
    for (const f of fields) {
      if (f.fieldNumber === 1 && f.wireType === 0) latI = decodeZigZag(f.value);
      else if (f.fieldNumber === 2 && f.wireType === 0) lonI = decodeZigZag(f.value);
      else if (f.fieldNumber === 3 && f.wireType === 0) altM = decodeZigZag(f.value);
      else if (f.fieldNumber === 4 && f.wireType === 5) time = f.value;
    }
    const lat = latI / 1e7;
    const lon = lonI / 1e7;
    if (lat === 0 && lon === 0) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon, altitude: altM, time, timestamp: time * 1000 };
  } catch {
    return null;
  }
}

/**
 * Encode a ToRadio message wrapping a MeshPacket with position data.
 * ToRadio: field 2 = MeshPacket (length-delimited)
 * MeshPacket: field 3 = DataPayload (length-delimited)
 * DataPayload: field 1 = portnum (varint), field 2 = payload (bytes)
 */
function encodeToRadioPosition(lat, lon, alt) {
  const posBytes = encodePosition(lat, lon, alt);
  // Data message: portnum=POSITION (field 1), payload (field 2)
  const dataMsg = [
    ...encodeVarintField(1, PORTNUM_POSITION),
    ...encodeLengthDelimited(2, [...posBytes]),
  ];
  // MeshPacket: decoded (field 3) = data message
  const meshPacket = encodeLengthDelimited(3, dataMsg);
  // ToRadio: packet (field 2) = mesh packet
  return new Uint8Array(encodeLengthDelimited(2, meshPacket));
}

/**
 * Encode a ToRadio.startConfig message to initiate the connection handshake.
 * ToRadio: field 3 = config_complete_id (varint)
 */
function encodeStartConfig() {
  configId = (configId + 1) & 0xFFFFFFFF;
  return new Uint8Array(encodeVarintField(3, configId));
}

/**
 * Parse a FromRadio message and extract position data if present.
 * FromRadio: field 1 = id (varint), field 7 = packet (MeshPacket)
 * MeshPacket: field 1 = from (uint32), field 3 = decoded (Data)
 * Data: field 1 = portnum (varint), field 2 = payload (bytes)
 */
function parseFromRadio(bytes) {
  try {
    const fields = parseProtobuf(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    // Look for field 7 (packet) — a MeshPacket
    const packetField = fields.find(f => f.fieldNumber === 7 && f.wireType === 2);
    if (!packetField) return null;

    const meshFields = parseProtobuf(packetField.value);
    let fromNode = 0;
    let dataPayload = null;

    for (const f of meshFields) {
      if (f.fieldNumber === 1 && f.wireType === 0) fromNode = f.value;
      if (f.fieldNumber === 3 && f.wireType === 2) dataPayload = f.value;
    }
    if (!dataPayload) return null;

    const dataFields = parseProtobuf(dataPayload);
    let portnum = 0;
    let payload = null;
    for (const f of dataFields) {
      if (f.fieldNumber === 1 && f.wireType === 0) portnum = f.value;
      if (f.fieldNumber === 2 && f.wireType === 2) payload = f.value;
    }

    if (portnum !== PORTNUM_POSITION || !payload) return null;

    const pos = decodePosition(payload);
    if (!pos) return null;
    return { ...pos, nodeId: fromNode };
  } catch {
    return null;
  }
}

// ─── BLE State Management ────────────────────────────────────────────────────

/**
 * Wait for BLE to reach PoweredOn state.
 * iOS CoreBluetooth starts as "Unknown" and transitions asynchronously.
 * Scanning before PoweredOn causes "not authorized" errors.
 */
async function waitForPoweredOn(mgr, timeoutMs = 10000) {
  const state = await mgr.state();
  if (state === 'PoweredOn') return;
  if (state === 'Unauthorized') throw new Error('Bluetooth permission denied. Check Settings > Privacy > Bluetooth.');
  if (state === 'PoweredOff') throw new Error('Bluetooth is turned off.');
  if (state === 'Unsupported') throw new Error('Bluetooth LE is not supported on this device.');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.remove();
      reject(new Error('Bluetooth did not become available within ' + (timeoutMs / 1000) + 's'));
    }, timeoutMs);

    const sub = mgr.onStateChange((newState) => {
      if (newState === 'PoweredOn') {
        clearTimeout(timer);
        sub.remove();
        resolve();
      } else if (newState === 'Unauthorized') {
        clearTimeout(timer);
        sub.remove();
        reject(new Error('Bluetooth permission denied. Check Settings > Privacy > Bluetooth.'));
      } else if (newState === 'PoweredOff') {
        clearTimeout(timer);
        sub.remove();
        reject(new Error('Bluetooth is turned off.'));
      }
    }, true); // true = emit current state immediately
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan for nearby Meshtastic devices.
 * Waits for BLE to be ready before scanning.
 */
export async function scanForDevices() {
  const mgr = getSharedBleManager();
  if (!mgr) throw new Error('BLE not available');

  // Wait for BLE to be ready — this is the critical fix for iOS
  await waitForPoweredOn(mgr);

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
 * Performs the full Meshtastic handshake: connect → discover → startConfig → monitor.
 */
export async function connectToDevice(deviceId) {
  const mgr = getSharedBleManager();
  if (!mgr) throw new Error('BLE not available');

  await waitForPoweredOn(mgr);

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

    // Send startConfig handshake — tells the radio we're a new client
    const startCfg = encodeStartConfig();
    await device.writeCharacteristicWithResponseForService(
      MESHTASTIC_SERVICE_UUID,
      TORADIO_UUID,
      bytesToBase64(startCfg),
    );

    // Drain the initial NodeDB by reading FromRadio until empty
    await drainFromRadio(device);

    // Subscribe to FromNum notifications — radio notifies us when new data is available
    startFromNumMonitoring(device);

    notifyStateChange(CONNECTION_STATES.CONNECTED);

    // Monitor disconnect for auto-reconnect
    mgr.onDeviceDisconnected(deviceId, () => {
      connectedDevice = null;
      if (fromNumSubscription) {
        try { fromNumSubscription.remove(); } catch {}
        fromNumSubscription = null;
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
  if (fromNumSubscription) {
    try { fromNumSubscription.remove(); } catch {}
    fromNumSubscription = null;
  }
  if (connectedDevice) {
    try { await connectedDevice.cancelConnection(); } catch {}
    connectedDevice = null;
  }
  notifyStateChange(CONNECTION_STATES.DISCONNECTED);
}

/**
 * Send a position to the mesh network using Meshtastic protobuf encoding.
 */
export async function sendPosition(lat, lon, altitude) {
  if (!connectedDevice) throw new Error('Not connected');

  const packet = encodeToRadioPosition(lat, lon, altitude);
  await connectedDevice.writeCharacteristicWithResponseForService(
    MESHTASTIC_SERVICE_UUID,
    TORADIO_UUID,
    bytesToBase64(packet),
  );
}

/**
 * Register callback for incoming position packets.
 */
export function onPositionReceived(callback) {
  positionListeners.push(callback);
  return () => { positionListeners = positionListeners.filter(fn => fn !== callback); };
}

/**
 * Register callback for connection state changes.
 */
export function onStateChange(callback) {
  stateListeners.push(callback);
  return () => { stateListeners = stateListeners.filter(fn => fn !== callback); };
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

/**
 * Read all pending FromRadio messages until the radio returns empty.
 * Called after startConfig to drain the initial NodeDB download.
 */
async function drainFromRadio(device) {
  const MAX_READS = 200; // safety cap
  for (let i = 0; i < MAX_READS; i++) {
    try {
      const char = await device.readCharacteristicForService(
        MESHTASTIC_SERVICE_UUID,
        FROMRADIO_UUID,
      );
      if (!char?.value) break;
      const raw = base64ToBytes(char.value);
      if (raw.length === 0) break;
      // Process any position packets found during drain
      processFromRadioBytes(raw);
    } catch {
      break;
    }
  }
}

/**
 * Subscribe to FromNum notifications.
 * When the radio has new data, it writes to FromNum.
 * On notification, we read FromRadio to get the actual packet.
 */
function startFromNumMonitoring(device) {
  if (fromNumSubscription) {
    try { fromNumSubscription.remove(); } catch {}
  }

  fromNumSubscription = device.monitorCharacteristicForService(
    MESHTASTIC_SERVICE_UUID,
    FROMNUM_UUID,
    async (error, characteristic) => {
      if (error) return;
      // FromNum notification means new data available — read FromRadio
      try {
        const char = await device.readCharacteristicForService(
          MESHTASTIC_SERVICE_UUID,
          FROMRADIO_UUID,
        );
        if (char?.value) {
          const raw = base64ToBytes(char.value);
          if (raw.length > 0) processFromRadioBytes(raw);
        }
      } catch {}
    }
  );
}

/**
 * Process raw FromRadio bytes — extract position if present and notify listeners.
 */
function processFromRadioBytes(raw) {
  const pos = parseFromRadio(raw);
  if (pos) {
    positionListeners.forEach(fn => { try { fn(pos); } catch {} });
  }
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
      scheduleReconnect();
    }
  }, 5000);
}

/**
 * Clean up BLE manager — call on app shutdown.
 */
export function destroy() {
  disconnect();
  destroySharedBleManager();
  stateListeners = [];
  positionListeners = [];
}
