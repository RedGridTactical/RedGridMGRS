/**
 * externalGPS — BLE external GPS receiver support.
 * Connects to Garmin GLO, Bad Elf, and other BLE GPS receivers
 * advertising the Location and Navigation Service (UUID 0x1819).
 *
 * Privacy: no data stored, no network. BLE data is ephemeral.
 */

// BLE UUIDs for Location and Navigation Service (LNS)
const LNS_SERVICE_UUID = '00001819-0000-1000-8000-00805f9b34fb';
const LN_FEATURE_CHAR  = '00002a6a-0000-1000-8000-00805f9b34fb';
const LOCATION_SPEED_CHAR = '00002a67-0000-1000-8000-00805f9b34fb';
const POSITION_QUALITY_CHAR = '00002a69-0000-1000-8000-00805f9b34fb';
const NAVIGATION_CHAR  = '00002a68-0000-1000-8000-00805f9b34fb';

// Also scan for NMEA-over-BLE (common on Bad Elf, some Garmin)
const NMEA_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const NMEA_CHAR_UUID    = '0000ffe1-0000-1000-8000-00805f9b34fb';

// Connection states
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  SCANNING:     'scanning',
  CONNECTING:   'connecting',
  CONNECTED:    'connected',
};

/**
 * Parse NMEA GGA sentence to extract position data.
 * $GPGGA,123456.00,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47
 */
export function parseGGA(sentence) {
  if (!sentence || typeof sentence !== 'string') return null;
  const parts = sentence.split(',');
  if (parts.length < 15) return null;
  if (!parts[0].endsWith('GGA')) return null;

  const rawLat = parts[2];
  const latDir = parts[3];
  const rawLon = parts[4];
  const lonDir = parts[5];
  const fixQuality = parseInt(parts[6], 10);
  const satellites = parseInt(parts[7], 10);
  const hdop = parseFloat(parts[8]);
  const altitude = parseFloat(parts[9]);

  if (!rawLat || !rawLon || fixQuality === 0) return null;

  const lat = nmeaToDecimal(rawLat, latDir);
  const lon = nmeaToDecimal(rawLon, lonDir);

  if (lat === null || lon === null) return null;

  return {
    lat,
    lon,
    altitude: isNaN(altitude) ? null : Math.round(altitude),
    satellites: isNaN(satellites) ? null : satellites,
    hdop: isNaN(hdop) ? null : hdop,
    accuracy: isNaN(hdop) ? null : Math.round(hdop * 5), // rough CEP estimate
  };
}

/**
 * Parse NMEA RMC sentence to extract speed and heading.
 * $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
 */
export function parseRMC(sentence) {
  if (!sentence || typeof sentence !== 'string') return null;
  const parts = sentence.split(',');
  if (parts.length < 12) return null;
  if (!parts[0].endsWith('RMC')) return null;

  const status = parts[2];
  if (status !== 'A') return null; // V = void/invalid

  const rawLat = parts[3];
  const latDir = parts[4];
  const rawLon = parts[5];
  const lonDir = parts[6];
  const speedKnots = parseFloat(parts[7]);
  const heading = parseFloat(parts[8]);

  const lat = nmeaToDecimal(rawLat, latDir);
  const lon = nmeaToDecimal(rawLon, lonDir);

  if (lat === null || lon === null) return null;

  return {
    lat,
    lon,
    speed: isNaN(speedKnots) ? null : speedKnots * 0.514444, // knots -> m/s
    heading: isNaN(heading) ? null : heading,
  };
}

/**
 * Convert NMEA coordinate (DDDMM.MMM or DDMM.MMM) to decimal degrees.
 */
export function nmeaToDecimal(raw, dir) {
  if (!raw || !dir) return null;
  const num = parseFloat(raw);
  if (isNaN(num)) return null;

  // Latitude: DDMM.MMMM (2-digit degrees), Longitude: DDDMM.MMMM (3-digit degrees)
  const isLon = dir === 'E' || dir === 'W';
  const degLen = isLon ? 3 : 2;
  const degrees = parseInt(raw.substring(0, degLen), 10);
  const minutes = parseFloat(raw.substring(degLen));

  if (isNaN(degrees) || isNaN(minutes)) return null;

  let decimal = degrees + (minutes / 60);
  if (dir === 'S' || dir === 'W') decimal = -decimal;

  return decimal;
}

/**
 * Parse BLE Location and Speed characteristic (0x2A67).
 * Returns position data from the binary payload per Bluetooth SIG spec.
 */
export function parseLNSPosition(base64Data) {
  if (!base64Data) return null;
  try {
    const bytes = base64ToBytes(base64Data);
    if (bytes.length < 2) return null;

    const flags = bytes[0] | (bytes[1] << 8);
    let offset = 2;
    const result = {};

    // Bit 0: Instantaneous Speed Present
    if (flags & 0x0001) {
      if (offset + 2 > bytes.length) return null;
      result.speed = (bytes[offset] | (bytes[offset + 1] << 8)) / 100; // m/s * 100
      offset += 2;
    }

    // Bit 1: Total Distance Present
    if (flags & 0x0002) {
      offset += 3; // skip 24-bit total distance
    }

    // Bit 2: Location Present
    if (flags & 0x0004) {
      if (offset + 8 > bytes.length) return null;
      const latRaw = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
      const lonRaw = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
      // Signed 32-bit int, resolution 10^-7 degrees
      result.lat = toSigned32(latRaw) / 10000000;
      result.lon = toSigned32(lonRaw) / 10000000;
      offset += 8;
    }

    // Bit 3: Elevation Present
    if (flags & 0x0008) {
      if (offset + 3 > bytes.length) return null;
      const elevRaw = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
      // Signed 24-bit, resolution 0.01m
      const signed = elevRaw > 0x7FFFFF ? elevRaw - 0x1000000 : elevRaw;
      result.altitude = Math.round(signed / 100);
      offset += 3;
    }

    // Bit 4: Heading Present
    if (flags & 0x0010) {
      if (offset + 2 > bytes.length) return null;
      result.heading = (bytes[offset] | (bytes[offset + 1] << 8)) / 100;
      offset += 2;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Parse BLE Position Quality characteristic (0x2A69).
 * Returns satellite count and HDOP.
 */
export function parseLNSQuality(base64Data) {
  if (!base64Data) return null;
  try {
    const bytes = base64ToBytes(base64Data);
    if (bytes.length < 2) return null;

    const flags = bytes[0] | (bytes[1] << 8);
    let offset = 2;
    const result = {};

    // Bit 0: Number of Beacons in Solution
    if (flags & 0x0001) {
      if (offset + 1 > bytes.length) return null;
      result.satellites = bytes[offset];
      offset += 1;
    }

    // Bit 1: Number of Beacons in View
    if (flags & 0x0002) {
      offset += 1;
    }

    // Bit 2: Time to First Fix
    if (flags & 0x0004) {
      offset += 2;
    }

    // Bit 3: EHPE (Estimated Horizontal Position Error)
    if (flags & 0x0008) {
      if (offset + 4 > bytes.length) return null;
      const ehpe = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
      result.accuracy = Math.round(ehpe / 100); // cm -> m
      offset += 4;
    }

    // Bit 4: EVPE
    if (flags & 0x0010) {
      offset += 4;
    }

    // Bit 5: HDOP
    if (flags & 0x0020) {
      if (offset + 1 > bytes.length) return null;
      result.hdop = bytes[offset] / 5;
      offset += 1;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Convert a base64 string to a Uint8Array.
 */
export function base64ToBytes(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const stripped = b64.replace(/[=]/g, '');
  const len = stripped.length;
  const byteLen = (len * 3) >> 2;
  const bytes = new Uint8Array(byteLen);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const a = lookup[stripped.charCodeAt(i)];
    const b = lookup[stripped.charCodeAt(i + 1)] || 0;
    const c = lookup[stripped.charCodeAt(i + 2)] || 0;
    const d = lookup[stripped.charCodeAt(i + 3)] || 0;
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLen) bytes[p++] = ((b & 0x0F) << 4) | (c >> 2);
    if (p < byteLen) bytes[p++] = ((c & 0x03) << 6) | d;
  }
  return bytes;
}

function toSigned32(val) {
  return val > 0x7FFFFFFF ? val - 0x100000000 : val;
}

/**
 * ExternalGPSManager — manages BLE scanning, connection, and data parsing.
 * Singleton-style class; instantiate once and share via hook.
 */
export class ExternalGPSManager {
  constructor() {
    this._manager = null;
    this._device = null;
    this._state = ConnectionState.DISCONNECTED;
    this._position = null;
    this._quality = { satellites: null, accuracy: null };
    this._deviceName = null;
    this._listeners = new Set();
    this._reconnectTimer = null;
    this._nmeaBuffer = '';
    this._scanSubscription = null;
  }

  /** Get the BleManager instance, lazy-loading react-native-ble-plx */
  _getBleManager() {
    if (!this._manager) {
      try {
        const { BleManager } = require('react-native-ble-plx');
        this._manager = new BleManager();
      } catch (e) {
        console.warn('react-native-ble-plx not available:', e.message);
        return null;
      }
    }
    return this._manager;
  }

  /** Subscribe to state changes */
  addListener(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    const snapshot = this.getSnapshot();
    this._listeners.forEach(fn => { try { fn(snapshot); } catch {} });
  }

  getSnapshot() {
    return {
      connectionState: this._state,
      externalPosition: this._position,
      satellites: this._quality.satellites,
      accuracy: this._quality.accuracy ?? this._position?.accuracy ?? null,
      deviceName: this._deviceName,
    };
  }

  /** Scan for BLE GPS devices */
  async scan(onDeviceFound) {
    const mgr = this._getBleManager();
    if (!mgr) return;

    this._setState(ConnectionState.SCANNING);
    this._stopScan();

    const seen = new Set();

    mgr.startDeviceScan(
      [LNS_SERVICE_UUID, NMEA_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          console.warn('BLE scan error:', error.message);
          return;
        }
        if (device && !seen.has(device.id)) {
          seen.add(device.id);
          onDeviceFound({
            id: device.id,
            name: device.name || device.localName || 'Unknown GPS',
            rssi: device.rssi,
          });
        }
      }
    );

    // Auto-stop scan after 15 seconds
    this._scanSubscription = setTimeout(() => {
      this._stopScan();
      if (this._state === ConnectionState.SCANNING) {
        this._setState(ConnectionState.DISCONNECTED);
      }
    }, 15000);
  }

  _stopScan() {
    const mgr = this._getBleManager();
    if (mgr) {
      try { mgr.stopDeviceScan(); } catch {}
    }
    if (this._scanSubscription) {
      clearTimeout(this._scanSubscription);
      this._scanSubscription = null;
    }
  }

  /** Connect to a specific BLE GPS device */
  async connect(deviceId, deviceName) {
    const mgr = this._getBleManager();
    if (!mgr) return;

    this._stopScan();
    this._setState(ConnectionState.CONNECTING);
    this._deviceName = deviceName || 'External GPS';

    try {
      const device = await mgr.connectToDevice(deviceId, { timeout: 10000 });
      this._device = device;

      await device.discoverAllServicesAndCharacteristics();

      // Monitor disconnect for auto-reconnect
      mgr.onDeviceDisconnected(deviceId, (error, dev) => {
        if (this._state === ConnectionState.CONNECTED) {
          this._setState(ConnectionState.DISCONNECTED);
          this._position = null;
          this._notify();
          this._scheduleReconnect(deviceId, deviceName);
        }
      });

      // Try LNS characteristics first
      await this._subscribeLNS(device);

      // Also try NMEA-over-BLE
      await this._subscribeNMEA(device);

      this._setState(ConnectionState.CONNECTED);
    } catch (e) {
      console.warn('BLE connect error:', e.message);
      this._setState(ConnectionState.DISCONNECTED);
      this._notify();
    }
  }

  async _subscribeLNS(device) {
    try {
      device.monitorCharacteristicForService(
        LNS_SERVICE_UUID,
        LOCATION_SPEED_CHAR,
        (error, char) => {
          if (error || !char?.value) return;
          const parsed = parseLNSPosition(char.value);
          if (parsed && parsed.lat !== undefined) {
            this._position = { ...this._position, ...parsed };
            this._notify();
          }
        }
      );
    } catch {}

    try {
      device.monitorCharacteristicForService(
        LNS_SERVICE_UUID,
        POSITION_QUALITY_CHAR,
        (error, char) => {
          if (error || !char?.value) return;
          const parsed = parseLNSQuality(char.value);
          if (parsed) {
            this._quality = { ...this._quality, ...parsed };
            this._notify();
          }
        }
      );
    } catch {}
  }

  async _subscribeNMEA(device) {
    try {
      device.monitorCharacteristicForService(
        NMEA_SERVICE_UUID,
        NMEA_CHAR_UUID,
        (error, char) => {
          if (error || !char?.value) return;
          try {
            const bytes = base64ToBytes(char.value);
            const text = String.fromCharCode(...bytes);
            this._processNMEA(text);
          } catch {}
        }
      );
    } catch {}
  }

  _processNMEA(data) {
    this._nmeaBuffer += data;
    const lines = this._nmeaBuffer.split('\n');
    // Keep last incomplete line in buffer
    this._nmeaBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('GGA')) {
        const parsed = parseGGA(trimmed);
        if (parsed) {
          this._position = { ...this._position, ...parsed };
          this._quality.satellites = parsed.satellites ?? this._quality.satellites;
          this._quality.accuracy = parsed.accuracy ?? this._quality.accuracy;
          this._notify();
        }
      } else if (trimmed.includes('RMC')) {
        const parsed = parseRMC(trimmed);
        if (parsed) {
          this._position = {
            ...this._position,
            lat: parsed.lat,
            lon: parsed.lon,
            speed: parsed.speed,
            heading: parsed.heading ?? this._position?.heading,
          };
          this._notify();
        }
      }
    }
  }

  _scheduleReconnect(deviceId, deviceName) {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      if (this._state === ConnectionState.DISCONNECTED && deviceId) {
        this.connect(deviceId, deviceName);
      }
    }, 3000);
  }

  /** Disconnect from the current device */
  async disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    const mgr = this._getBleManager();
    if (mgr && this._device) {
      try {
        await mgr.cancelDeviceConnection(this._device.id);
      } catch {}
    }

    this._device = null;
    this._position = null;
    this._quality = { satellites: null, accuracy: null };
    this._deviceName = null;
    this._nmeaBuffer = '';
    this._setState(ConnectionState.DISCONNECTED);
  }

  _setState(state) {
    this._state = state;
    this._notify();
  }

  /** Clean up BLE manager */
  destroy() {
    this.disconnect();
    if (this._manager) {
      try { this._manager.destroy(); } catch {}
      this._manager = null;
    }
  }
}

// Singleton instance
let _instance = null;
export function getExternalGPSManager() {
  if (!_instance) {
    _instance = new ExternalGPSManager();
  }
  return _instance;
}
