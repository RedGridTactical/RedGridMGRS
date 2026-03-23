/**
 * GeostampTool — Photo geostamp: burns MGRS + DTG onto a photo.
 * Pro-only feature. Takes photo via camera or picks from library,
 * overlays MGRS grid + date-time group, saves to camera roll.
 *
 * Uses react-native-view-shot to composite the overlay onto the image.
 * No photos are uploaded or transmitted. All processing is on-device.
 *
 * HARDENING:
 *   - All native modules loaded defensively
 *   - Permission requests have explicit error handling
 *   - Mounted checks on all async state updates
 *   - Never throws — graceful degradation throughout
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import { useColors } from '../../utils/ThemeContext';
import { tapMedium, tapHeavy, notifySuccess, notifyWarning } from '../../utils/haptics';
import { toMGRS, formatMGRS } from '../../utils/mgrs';
import { useTranslation } from '../../hooks/useTranslation';

// ─── Defensive module loading ────────────────────────────────────────────────
let ImagePicker = null;
let MediaLibrary = null;
let ViewShot = null;

try { ImagePicker = require('expo-image-picker'); } catch {}
try { MediaLibrary = require('expo-media-library'); } catch {}
try { ViewShot = require('react-native-view-shot'); } catch {}

const captureRef = ViewShot?.captureRef || null;

/**
 * Generate DTG string: DDHHMMz MON YYYY (Zulu time)
 */
function getDTG() {
  const n = new Date();
  const dd = String(n.getUTCDate()).padStart(2, '0');
  const hh = String(n.getUTCHours()).padStart(2, '0');
  const mm = String(n.getUTCMinutes()).padStart(2, '0');
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${dd}${hh}${mm}Z ${months[n.getUTCMonth()]} ${n.getUTCFullYear()}`;
}

export function GeostampTool({ location }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [photoUri, setPhotoUri] = useState(null);
  const [photoDims, setPhotoDims] = useState({ width: 1, height: 1 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [captureGrid, setCaptureGrid] = useState(null);
  const [captureDTG, setCaptureDTG] = useState(null);
  const compositeRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Compute MGRS at capture time
  const mgrsNow = location
    ? formatMGRS(toMGRS(location.lat, location.lon, 5))
    : null;

  const modulesAvailable = ImagePicker && MediaLibrary && captureRef;

  // ─── Take photo with camera ────────────────────────────────────────────
  const takePhoto = useCallback(async () => {
    if (!ImagePicker) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('toolLabels.permissionRequired'), t('toolLabels.cameraPermission'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.95,
        exif: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (mounted.current) {
        setPhotoUri(asset.uri);
        setPhotoDims({ width: asset.width || 1200, height: asset.height || 1600 });
        setCaptureGrid(mgrsNow);
        setCaptureDTG(getDTG());
        setSaved(false);
      }
      tapMedium();
    } catch (err) {
      if (mounted.current) {
        Alert.alert(t('toolLabels.cameraError'), err?.message || 'Could not take photo.');
      }
    }
  }, [mgrsNow]);

  // ─── Pick from library ─────────────────────────────────────────────────
  const pickPhoto = useCallback(async () => {
    if (!ImagePicker) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('toolLabels.permissionRequired'), t('toolLabels.libraryPermission'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.95,
        exif: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (mounted.current) {
        setPhotoUri(asset.uri);
        setPhotoDims({ width: asset.width || 1200, height: asset.height || 1600 });
        setCaptureGrid(mgrsNow);
        setCaptureDTG(getDTG());
        setSaved(false);
      }
      tapMedium();
    } catch (err) {
      if (mounted.current) {
        Alert.alert(t('toolLabels.libraryError'), err?.message || 'Could not pick photo.');
      }
    }
  }, [mgrsNow]);

  // ─── Save geostamped image ─────────────────────────────────────────────
  const saveGeostamp = useCallback(async () => {
    if (!captureRef || !compositeRef.current || !MediaLibrary) return;

    if (mounted.current) setSaving(true);

    try {
      // Request media library write permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('toolLabels.permissionRequired'), t('toolLabels.writePermission'));
        if (mounted.current) setSaving(false);
        return;
      }

      // Capture the composite view as a high-res image
      const uri = await captureRef(compositeRef, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });

      // Save to camera roll
      await MediaLibrary.saveToLibraryAsync(uri);

      if (mounted.current) {
        setSaving(false);
        setSaved(true);
      }
      tapHeavy();
      notifySuccess();
      Alert.alert(t('toolLabels.saved'), t('toolLabels.photoSaved'));
    } catch (err) {
      if (mounted.current) setSaving(false);
      notifyWarning();
      Alert.alert(t('toolLabels.saveError'), err?.message || 'Could not save photo.');
    }
  }, []);

  // ─── Clear photo ───────────────────────────────────────────────────────
  const clearPhoto = useCallback(() => {
    setPhotoUri(null);
    setCaptureGrid(null);
    setCaptureDTG(null);
    setSaved(false);
  }, []);

  // Module unavailable fallback
  if (!modulesAvailable) {
    return (
      <View style={styles.unavailable}>
        <Text style={[styles.unavailableText, { color: colors.text3 }]}>
          {t('toolLabels.modulesUnavailable')}
        </Text>
      </View>
    );
  }

  // No GPS fix
  if (!location) {
    return (
      <View style={styles.unavailable}>
        <Text style={[styles.unavailableText, { color: colors.text3 }]}>
          {t('gps.waitingForFix')}
        </Text>
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────
  const screenWidth = Dimensions.get('window').width - 60; // account for padding
  const aspectRatio = photoDims.width / photoDims.height;
  const previewWidth = Math.min(screenWidth, 360);
  const previewHeight = previewWidth / aspectRatio;
  // Scale font relative to image width for consistent stamp sizing
  const stampFontSize = Math.max(10, Math.round(previewWidth * 0.038));

  return (
    <View style={styles.root}>
      {!photoUri ? (
        // ─── Source selection ─────────────────────────────────────────
        <View style={styles.sourceButtons}>
          <TouchableOpacity
            style={[styles.sourceBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]}
            onPress={takePhoto}
            accessibilityRole="button"
            accessibilityLabel="Take photo with camera"
          >
            <Text style={[styles.sourceBtnText, { color: colors.text }]}>{'\ud83d\udcf7'}  {t('toolLabels.takePhoto')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sourceBtn, { borderColor: colors.border }]}
            onPress={pickPhoto}
            accessibilityRole="button"
            accessibilityLabel={t('toolLabels.fromLibrary')}
          >
            <Text style={[styles.sourceBtnText, { color: colors.text2 }]}>{'\ud83d\uddbc'}  {t('toolLabels.fromLibrary')}</Text>
          </TouchableOpacity>
          <Text style={[styles.hint, { color: colors.text4 }]}>
            {t('toolLabels.currentGrid')}: {mgrsNow || '\u2014'}
          </Text>
        </View>
      ) : (
        // ─── Preview + save ──────────────────────────────────────────
        <View style={styles.previewContainer}>
          {/* Composite view — this is what gets captured */}
          <View
            ref={compositeRef}
            collapsable={false}
            style={[styles.composite, { width: previewWidth, height: previewHeight }]}
          >
            <Image
              source={{ uri: photoUri }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            {/* Geostamp overlay bar */}
            <View style={styles.stampBar}>
              <Text style={[styles.stampGrid, { fontSize: stampFontSize }]}>{captureGrid || '—'}</Text>
              <Text style={[styles.stampDTG, { fontSize: stampFontSize * 0.8 }]}>{captureDTG || '—'}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {saving ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.text, borderColor: colors.text }, saved && { opacity: 0.5 }]}
                  onPress={saveGeostamp}
                  disabled={saved}
                  accessibilityRole="button"
                  accessibilityLabel={saved ? 'Photo already saved' : 'Save geostamped photo'}
                >
                  <Text style={[styles.saveBtnText, { color: colors.bg }]}>{saved ? t('toolLabels.savedCheck') : t('toolLabels.saveToPhotos')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.clearBtn, { borderColor: colors.border }]}
                  onPress={clearPhoto}
                  accessibilityRole="button"
                  accessibilityLabel={t('toolLabels.discard')}
                >
                  <Text style={[styles.clearBtnText, { color: colors.border }]}>{t('toolLabels.discard')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          <Text style={[styles.hint, { color: colors.text4 }]}>
            {t('toolLabels.photoOnDevice')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  // Source selection
  sourceButtons: { gap: 10 },
  sourceBtn: {
    borderWidth: 1, paddingVertical: 14, alignItems: 'center', minHeight: 44,
  },
  sourceBtnText: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '700' },
  // Preview
  previewContainer: { alignItems: 'center', gap: 12 },
  composite: { overflow: 'hidden', position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  // Stamp overlay
  stampBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  stampGrid: {
    fontFamily: 'monospace', fontWeight: '700', letterSpacing: 2, color: '#FFFFFF',
  },
  stampDTG: {
    fontFamily: 'monospace', letterSpacing: 1, color: '#CCCCCC', marginTop: 1,
  },
  // Actions
  actionRow: { flexDirection: 'row', gap: 10, width: '100%' },
  saveBtn: {
    flex: 2, borderWidth: 1, paddingVertical: 12, alignItems: 'center', minHeight: 44,
  },
  saveBtnText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  clearBtn: {
    flex: 1, borderWidth: 1, paddingVertical: 12, alignItems: 'center', minHeight: 44,
  },
  clearBtnText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3 },
  // Hints
  hint: { fontSize: 8, letterSpacing: 1, textAlign: 'center', marginTop: 4, lineHeight: 14 },
  unavailable: { paddingVertical: 16, alignItems: 'center' },
  unavailableText: { fontSize: 10, letterSpacing: 1, textAlign: 'center', lineHeight: 16 },
});
