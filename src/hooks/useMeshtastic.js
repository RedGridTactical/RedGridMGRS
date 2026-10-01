/**
 * useMeshtastic — React hook for Meshtastic mesh radio integration.
 * Wraps src/utils/meshtastic.js with React state management.
 * Provides scan, connect, disconnect, position sharing, and received positions.
 */
import { AppState } from 'react-native';
import { isFreshPosition, validCoordinates } from '../utils/position';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CONNECTION_STATES,
  scanForDevices,
  connectToDevice as meshConnect,
  disconnect as meshDisconnect,
  sendPosition,
  onPositionReceived,
  onStateChange,
  getConnectionState,
  getConnectedDevice,
} from '../utils/meshtastic';

const AUTO_SHARE_INTERVAL = 30000; // 30 seconds
const MAX_MESH_POSITIONS = 50;

export function useMeshtastic(enabled = true) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [connectionState, setConnectionState] = useState(getConnectionState());
  const [nearbyDevices, setNearbyDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(getConnectedDevice());
  const [meshPositions, setMeshPositions] = useState([]);
  const [autoShare, setAutoShare] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const foregroundRef = useRef(foreground);
  const connectionRevision = useRef(0);
  const writing = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      foregroundRef.current = state === 'active';
      setForeground(foregroundRef.current);
    });
    return () => sub.remove();
  }, []);

  const mounted = useRef(true);
  const autoShareRef = useRef(false);
  const lastPosition = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { if (!enabled) { autoShareRef.current = false; setAutoShare(false); } }, [enabled]);

  // Subscribe to connection state changes
  useEffect(() => {
    const unsub = onStateChange((state) => {
      if (mounted.current) {
        ++connectionRevision.current;
        setConnectionState(state);
        if (state === CONNECTION_STATES.CONNECTED) {
          setConnectedDevice(getConnectedDevice());
        } else if (state === CONNECTION_STATES.DISCONNECTED) {
          setConnectedDevice(null);
          autoShareRef.current = false;
          setAutoShare(false);
          setLastSend(null);
        }
      }
    });
    return unsub;
  }, []);

  // Subscribe to incoming position packets
  useEffect(() => {
    const unsub = onPositionReceived((pos) => {
      if (!mounted.current) return;
      setMeshPositions(prev => {
        // Update existing node or add new
        const idx = prev.findIndex(p => p.nodeId === pos.nodeId && pos.nodeId !== 0);
        let next;
        if (idx >= 0) {
          next = [...prev];
          next[idx] = pos;
        } else {
          next = [pos, ...prev];
        }
        // Cap list size
        if (next.length > MAX_MESH_POSITIONS) {
          next = next.slice(0, MAX_MESH_POSITIONS);
        }
        return next;
      });
    });
    return unsub;
  }, []);

  // A successful BLE write is acceptance by this radio, never peer receipt.
  const sharePosition = useCallback(async (lat, lon, alt, timestamp) => {
    const source = lastPosition.current;
    const fix = { lat, lon, timestamp: timestamp ?? (source?.lat === lat && source?.lon === lon ? source.timestamp : null) };
    if (!enabledRef.current || !foregroundRef.current || getConnectionState() !== CONNECTION_STATES.CONNECTED || writing.current) return false;
    if (!isFreshPosition(fix)) {
      if (mounted.current) setLastSend({ status: 'noFreshFix', at: Date.now() });
      return false;
    }
    const revision = connectionRevision.current;
    writing.current = true;
    setLastSend({ status: 'writing', at: Date.now() });
    try {
      await sendPosition(lat, lon, alt);
      if (revision !== connectionRevision.current) return false;
      if (mounted.current) setLastSend({ status: 'radioAccepted', at: Date.now() });
      return true;
    } catch {
      if (mounted.current && revision === connectionRevision.current) setLastSend({ status: 'failed', at: Date.now() });
      return false;
    } finally { writing.current = false; }
  }, []);

  useEffect(() => {
    autoShareRef.current = autoShare;
    if (!autoShare || !foreground || connectionState !== CONNECTION_STATES.CONNECTED) return;
    const tick = () => {
      if (!mounted.current || !autoShareRef.current || !foregroundRef.current) return;
      const pos = lastPosition.current;
      sharePosition(pos?.lat, pos?.lon, pos?.alt, pos?.timestamp);
    };
    tick();
    const timer = setInterval(tick, AUTO_SHARE_INTERVAL);
    return () => clearInterval(timer);
  }, [autoShare, foreground, connectionState, sharePosition]);

  const scan = useCallback(async () => {
    if (!mounted.current) return;
    setScanError(null);
    try {
      const devices = await scanForDevices();
      if (mounted.current) {
        setNearbyDevices(devices);
      }
    } catch (err) {
      if (mounted.current) {
        // Carry the machine-readable code alongside the English message so the
        // screen can translate it and still have something to show if it can't.
        setScanError({ code: err?.code || null, message: err?.message || 'Scan failed' });
      }
    }
  }, []);

  const connect = useCallback(async (deviceId) => {
    if (!mounted.current) return;
    try {
      const device = await meshConnect(deviceId);
      if (mounted.current) {
        setConnectedDevice(device);
      }
    } catch (err) {
      if (mounted.current) {
        setScanError({ code: err?.code || null, message: err?.message || 'Connection failed' });
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    await meshDisconnect();
    if (mounted.current) {
      setConnectedDevice(null);
      setAutoShare(false);
    }
  }, []);

  const toggleAutoShare = useCallback(() => {
    if (!enabledRef.current || getConnectionState() !== CONNECTION_STATES.CONNECTED || !foregroundRef.current) return;
    setAutoShare(prev => !prev);
  }, []);

  const setLastPosition = useCallback((lat, lon, alt, timestamp) => {
    lastPosition.current = validCoordinates({ lat, lon }) && Number.isFinite(timestamp)
      ? { lat, lon, alt, timestamp } : null;
  }, []);

  // Memoized so consumers' dependency arrays stop churning on every render —
  // the object literal (and the inline setter it used to carry) invalidated
  // every effect keyed on `mesh` once per render.
  return useMemo(() => ({
    connectionState,
    nearbyDevices,
    connectedDevice,
    meshPositions,
    autoShare,
    lastSend,
    sharingState: !autoShare ? 'off' : !foreground ? 'paused' : 'on',
    isConnected: connectionState === CONNECTION_STATES.CONNECTED,
    scanError,
    scan,
    connect,
    disconnect,
    sharePosition,
    toggleAutoShare,
    setLastPosition,
  }), [
    connectionState, nearbyDevices, connectedDevice, meshPositions, autoShare, lastSend, foreground,
    scanError, scan, connect, disconnect, sharePosition, toggleAutoShare, setLastPosition,
  ]);
}
