/**
 * useExternalGPS — React hook for BLE external GPS receivers.
 * Wraps ExternalGPSManager and provides reactive state.
 *
 * When connected, externalPosition overrides the internal GPS.
 * Falls back to internal GPS when disconnected.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState } from 'react-native';
import { selectPositionSource } from '../utils/position';
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
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 1000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  return useMemo(() => selectPositionSource(internalLocation, externalGPS, Math.max(now, Date.now())),
    [internalLocation, externalGPS?.externalPosition, externalGPS?.connectionState, externalGPS?.deviceName, now]);
}
