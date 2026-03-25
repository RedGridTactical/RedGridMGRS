/**
 * useExternalGPS — React hook for BLE external GPS receivers.
 * Wraps ExternalGPSManager and provides reactive state.
 *
 * When connected, externalPosition overrides the internal GPS.
 * Falls back to internal GPS when disconnected.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getExternalGPSManager, ConnectionState } from '../utils/externalGPS';

export { ConnectionState } from '../utils/externalGPS';

export function useExternalGPS() {
  const mgr = useRef(getExternalGPSManager()).current;

  const [state, setState] = useState(() => mgr.getSnapshot());
  const [discoveredDevices, setDiscoveredDevices] = useState([]);

  useEffect(() => {
    const unsub = mgr.addListener((snapshot) => {
      setState(snapshot);
    });
    return unsub;
  }, [mgr]);

  const scan = useCallback(() => {
    setDiscoveredDevices([]);
    mgr.scan((device) => {
      setDiscoveredDevices(prev => {
        if (prev.some(d => d.id === device.id)) return prev;
        return [...prev, device];
      });
    });
  }, [mgr]);

  const connect = useCallback((deviceId, deviceName) => {
    mgr.connect(deviceId, deviceName);
  }, [mgr]);

  const disconnect = useCallback(() => {
    mgr.disconnect();
    setDiscoveredDevices([]);
  }, [mgr]);

  const stopScan = useCallback(() => {
    mgr._stopScan();
    if (state.connectionState === ConnectionState.SCANNING) {
      // Will revert to disconnected
    }
  }, [mgr, state.connectionState]);

  return {
    // State
    connectionState: state.connectionState,
    externalPosition: state.externalPosition,
    satellites: state.satellites,
    accuracy: state.accuracy,
    deviceName: state.deviceName,
    discoveredDevices,
    // Actions
    scan,
    connect,
    disconnect,
    stopScan,
  };
}

/**
 * useGPSSource — Merges internal and external GPS, preferring external when connected.
 * Drop-in replacement pattern: use this wherever you need position data.
 *
 * @param {object} internalLocation - The location object from useLocation()
 * @param {object} externalGPS - The return value from useExternalGPS()
 * @returns {object} The active position (external if connected, else internal)
 */
export function useGPSSource(internalLocation, externalGPS) {
  if (
    externalGPS &&
    externalGPS.connectionState === ConnectionState.CONNECTED &&
    externalGPS.externalPosition &&
    externalGPS.externalPosition.lat !== undefined
  ) {
    return {
      location: {
        lat: externalGPS.externalPosition.lat,
        lon: externalGPS.externalPosition.lon,
        accuracy: externalGPS.accuracy ?? externalGPS.externalPosition.accuracy,
        heading: externalGPS.externalPosition.heading,
        altitude: externalGPS.externalPosition.altitude,
        speed: externalGPS.externalPosition.speed,
      },
      source: 'external',
      deviceName: externalGPS.deviceName,
    };
  }

  return {
    location: internalLocation,
    source: 'internal',
    deviceName: null,
  };
}
