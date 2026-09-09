/** Device annotations are separate from original image metadata. Processing is local. */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Alert } from '../../utils/fieldAlert';
import { useColors } from '../../utils/ThemeContext';
import { notifySuccess } from '../../utils/haptics';
import { useTranslation } from '../../hooks/useTranslation';
import { useSessionDraft } from '../../hooks/useSessionDraft';
import { createDeviceAnnotation, photoExportSize, formatWorkflowUTC } from '../../utils/toolWorkflow';
import { ToolHint } from './ToolShared';
import { TYPE } from '../../utils/typography';

let ImagePicker = null, MediaLibrary = null, ViewShot = null;
try { ImagePicker = require('expo-image-picker'); } catch {}
try { MediaLibrary = require('expo-media-library'); } catch {}
try { ViewShot = require('react-native-view-shot'); } catch {}
const imageSize = uri => new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

export function GeostampTool({ location }) {
  const colors = useColors();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [draft, setDraft] = useSessionDraft('tool:geostamp:draft', { photo: null, annotation: null });
  const [availableWidth, setAvailableWidth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [readyURI, setReadyURI] = useState(null);
  const [message, setMessage] = useState('');
  const busyRef = useRef(false);
  const compositeRef = useRef(null);
  const mounted = useRef(true);
  const latest = useRef({ draft, location });
  latest.current = { draft, location };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { photo, annotation } = draft;
  const size = photo ? photoExportSize(photo.width, photo.height) : null;
  const previewWidth = Math.max(120, availableWidth || windowWidth - 64);
  const previewHeight = size ? previewWidth * size.height / size.width : 0;
  const modulesAvailable = !!(ImagePicker && MediaLibrary && ViewShot?.captureRef);

  const choosePhoto = async source => {
    if (!ImagePicker || busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage('');
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mounted.current) return;
      if (permission.status !== 'granted') {
        Alert.alert(t('toolLabels.permissionRequired'), t(source === 'camera' ? 'toolLabels.cameraPermission' : 'toolLabels.libraryPermission'));
        return;
      }
      const options = { mediaTypes: ['images'], quality: 1, exif: false };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!mounted.current || result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const dimensions = await imageSize(asset.uri);
      if (!mounted.current) return;
      if (!photoExportSize(dimensions.width, dimensions.height)) throw new Error('INVALID_PHOTO_SIZE');
      setReadyURI(null);
      setDraft({ photo: { uri: asset.uri, ...dimensions, source }, annotation: null });
    } catch {
      if (mounted.current) { setMessage(t('workflow.photoMissing')); Alert.alert(t('workflow.photoMissing')); }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const chooseLibrary = () => Alert.alert(t('workflow.libraryAnnotationTitle'), t('workflow.libraryAnnotationBody'), [
    { text: t('reports.cancel'), style: 'cancel' },
    { text: t('workflow.continue'), onPress: () => choosePhoto('library') },
  ]);
  const pinAnnotation = () => {
    if (!photo || busyRef.current) return;
    const snapshot = createDeviceAnnotation(latest.current.location, Date.now());
    if (!snapshot) { Alert.alert(t('workflow.annotationNoFix')); return; }
    setDraft(previous => ({ ...previous, annotation: snapshot }));
    setMessage('');
  };
  const save = async () => {
    if (!photo || !annotation || !size || readyURI !== photo.uri || !modulesAvailable || busyRef.current) return;
    const capturedDraft = draft;
    busyRef.current = true; setBusy(true); setMessage('');
    let uri;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!mounted.current || latest.current.draft !== capturedDraft) return;
      if (permission.status !== 'granted') {
        Alert.alert(t('toolLabels.permissionRequired'), t('toolLabels.libraryPermission')); return;
      }
      // Wait for the pinned annotation to reach native layout before capture.
      await nextFrame(); await nextFrame();
      if (!mounted.current || latest.current.draft !== capturedDraft) return;
      uri = await ViewShot.captureRef(compositeRef, { format: 'jpg', quality: 0.95, result: 'tmpfile', width: size.width, height: size.height });
      const actual = await imageSize(uri);
      if (!mounted.current || latest.current.draft !== capturedDraft) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      if (mounted.current) {
        notifySuccess(); setMessage(t('workflow.exportActual', { width: actual.width, height: actual.height }));
      }
    } catch {
      if (mounted.current) { setMessage(t('workflow.saveFailed')); Alert.alert(t('workflow.saveFailed')); }
    } finally {
      if (uri && ViewShot?.releaseCapture) { try { ViewShot.releaseCapture(uri); } catch {} }
      busyRef.current = false; if (mounted.current) setBusy(false);
    }
  };
  const action = (label, onPress, disabled = busy) => <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.button, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}>
    <Text style={[styles.buttonText, { color: colors.text2 }]}>{label}</Text>
  </TouchableOpacity>;

  return <View onLayout={event => { const width = event.nativeEvent.layout.width; if (Number.isFinite(width) && width > 0) setAvailableWidth(width); }}>
    <ToolHint text={t('workflow.annotationHint')} />
    {!modulesAvailable && <ToolHint text={t('toolLabels.modulesUnavailable')} />}
    <View style={styles.actions}>
      {action(t('toolLabels.takePhoto'), () => choosePhoto('camera'), busy || !modulesAvailable)}
      {action(t('toolLabels.fromLibrary'), chooseLibrary, busy || !modulesAvailable)}
    </View>
    {photo && size && <>
      <View ref={compositeRef} collapsable={false} style={{ width: previewWidth, height: previewHeight, backgroundColor: '#080A09' }}>
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" onLoad={() => setReadyURI(photo.uri)} onError={() => { setReadyURI(null); setMessage(t('workflow.photoMissing')); }} accessible={false} />
        {annotation && <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayLabel} allowFontScaling={false}>{t('workflow.annotationLabel')}</Text>
          <Text style={styles.overlayGrid} allowFontScaling={false}>{annotation.grid}</Text>
          <Text style={styles.overlayTime} allowFontScaling={false}>{t('workflow.annotationFix', { time: formatWorkflowUTC(annotation.fixTimestamp) })}</Text>
          <Text style={styles.overlayTime} allowFontScaling={false}>{t('workflow.annotationTime', { time: formatWorkflowUTC(annotation.annotatedAt) })}</Text>
        </View>}
      </View>
      {readyURI !== photo.uri && <ToolHint text={t('workflow.photoLoading')} />}
      {action(t('workflow.pinAnnotation'), pinAnnotation)}
      {annotation && <View accessible accessibilityLabel={`${t('workflow.annotationLabel')}. ${annotation.grid}. ${t('workflow.annotationFix', { time: formatWorkflowUTC(annotation.fixTimestamp) })}. ${t('workflow.annotationTime', { time: formatWorkflowUTC(annotation.annotatedAt) })}`}>
        <ToolHint text={t('workflow.exportSize', size)} />
      </View>}
      <View style={styles.actions}>
        {action(t('toolLabels.saveToPhotos'), save, busy || !annotation || readyURI !== photo.uri || !modulesAvailable)}
        {action(t('toolLabels.discard'), () => { setDraft({ photo: null, annotation: null }); setReadyURI(null); setMessage(''); })}
      </View>
    </>}
    {busy && <ActivityIndicator color={colors.text2} />}
    {!!message && <Text style={[styles.message, { color: colors.text2 }]} accessibilityLiveRegion="polite">{message}</Text>}
    <ToolHint text={t('tools.photoOnDevice')} />
  </View>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  button: { minHeight: 44, padding: 10, borderWidth: 1, justifyContent: 'center', marginTop: 8 },
  buttonText: { ...TYPE.label, fontSize: 12, flexShrink: 1 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, backgroundColor: 'rgba(0,0,0,0.82)' },
  overlayLabel: { ...TYPE.label, color: '#E1E7E0', fontSize: 10, marginBottom: 4 },
  overlayGrid: { ...TYPE.data, color: '#FFFFFF', fontSize: 18, marginBottom: 4 },
  overlayTime: { ...TYPE.data, color: '#E1E7E0', fontSize: 10, marginTop: 2 },
  message: { ...TYPE.body, fontSize: 13, lineHeight: 18, marginTop: 10 },
});
