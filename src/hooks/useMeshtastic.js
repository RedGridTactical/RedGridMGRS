/**
 * useMeshtastic — React hook for Meshtastic mesh radio integration.
 * Wraps src/utils/meshtastic.js with React state management.
 * Provides scan, connect, disconnect, position sharing, and received positions.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useMeshtastic() {
  const [connectionState, setConnectionState] = useState(getConnectionState());
  const [nearbyDevices, setNearbyDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(getConnectedDevice());
  const [meshPositions, setMeshPositions] = useState([]);
  const [autoShare, setAutoShare] = useState(false);
  const [scanError, setScanError] = useState(null);

  const mounted = useRef(true);
  const autoShareRef = useRef(false);
  const lastPosition = useRef(null);
  const autoShareTimer = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Subscribe to connection state changes
  useEffect(() => {
    const unsub = onStateChange((state) => {
      if (mounted.current) {
        setConnectionState(state);
        if (state === CONNECTION_STATES.CONNECTED) {
          setConnectedDevice(getConnectedDevice());
        } else if (state === CONNECTION_STATES.DISCONNECTED) {
          setConnectedDevice(null);
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

  // Auto-share position at interval
  useEffect(() => {
    autoShareRef.current = autoShare;
  }, [autoShare]);

  useEffect(() => {
    if (autoShare && connectionState === CONNECTION_STATES.CONNECTED) {
      const tick = () => {
        if (!mounted.current || !autoShareRef.current) return;
        const pos = lastPosition.current;
        if (pos) {
          sendPosition(pos.lat, pos.lon, pos.alt).catch(() => {});
        }
      };
      // Send immediately, then every 30s
      tick();
      autoShareTimer.current = setInterval(tick, AUTO_SHARE_INTERVAL);
      return () => {
        if (autoShareTimer.current) {
          clearInterval(autoShareTimer.current);
          autoShareTimer.current = null;
        }
      };
    } else {
      if (autoShareTimer.current) {
        clearInterval(autoShareTimer.current);
        autoShareTimer.current = null;
      }
    }
  }, [autoShare, connectionState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoShareTimer.current) {
        clearInterval(autoShareTimer.current);
        autoShareTimer.current = null;
      }
    };
  }, []);

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
        setScanError(err?.message || 'Scan failed');
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
        setScanError(err?.message || 'Connection failed');
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

  const sharePosition = useCallback(async (lat, lon, alt) => {
    lastPosition.current = { lat, lon, alt };
    if (connectionState !== CONNECTION_STATES.CONNECTED) return;
    try {
      await sendPosition(lat, lon, alt);
    } catch {}
  }, [connectionState]);

  const toggleAutoShare = useCallback(() => {
    setAutoShare(prev => !prev);
  }, []);

  return {
    connectionState,
    nearbyDevices,
    connectedDevice,
    meshPositions,
    autoShare,
    scanError,
    scan,
    connect,
    disconnect,
    sharePosition,
    toggleAutoShare,
    setLastPosition: (lat, lon, alt) => { lastPosition.current = { lat, lon, alt }; },
  };
}
