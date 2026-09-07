import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal as NativeModal, View, StyleSheet, BackHandler } from 'react-native';
import { useDisplaySafety } from '../utils/ThemeContext';

let sequence = 0;
const entries = new Map();
const listeners = new Set();
const publish = () => listeners.forEach(listener => listener(Array.from(entries.values())));

export function useFieldModalVisibility() {
  const [visible, setVisible] = useState(entries.size > 0);
  useLayoutEffect(() => {
    const listener = items => setVisible(items.length > 0);
    listeners.add(listener);
    listener(Array.from(entries.values()));
    return () => { listeners.delete(listener); };
  }, []);
  return visible;
}

/** Tactical overlays share the app window's dimming, system bars and readiness mask. */
export function Modal(props) {
  const { tacticalMode } = useDisplaySafety();
  const id = useRef(null);
  if (!id.current) id.current = ++sequence;
  const visible = props.visible !== false;
  useLayoutEffect(() => {
    if (tacticalMode && visible) {
      entries.set(id.current, { id: id.current, children: props.children, onRequestClose: props.onRequestClose });
      publish();
    } else if (entries.delete(id.current)) publish();
  }, [tacticalMode, visible, props.children, props.onRequestClose]);
  useEffect(() => () => { if (entries.delete(id.current)) publish(); }, []);
  if (tacticalMode) return null;
  return <NativeModal {...props} />;
}

export function FieldModalHost() {
  const { tacticalMode, brightnessReady = true, active = true } = useDisplaySafety();
  const [modals, setModals] = useState(() => Array.from(entries.values()));
  useLayoutEffect(() => {
    listeners.add(setModals);
    setModals(Array.from(entries.values()));
    return () => { listeners.delete(setModals); };
  }, []);
  const top = modals[modals.length - 1];
  useEffect(() => {
    if (!tacticalMode || !top) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { top.onRequestClose?.(); return true; });
    return () => handler.remove();
  }, [tacticalMode, top]);
  if (!tacticalMode || !modals.length) return null;
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {modals.map((modal, index) => <View key={modal.id} style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} accessibilityViewIsModal={index === modals.length - 1} accessibilityElementsHidden={index !== modals.length - 1} importantForAccessibility={index === modals.length - 1 ? 'yes' : 'no-hide-descendants'}>{modal.children}</View>)}
    {(!brightnessReady || !active) && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} />}
  </View>;
}
