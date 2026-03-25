/**
 * WaypointPicker — Modal for selecting and ordering waypoints for route planning.
 * Shows saved waypoints with checkboxes and reorder controls.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { notifySuccess } from '../utils/haptics';

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {Function} props.onClose
 * @param {Array<{lat: number, lon: number, name: string, mgrs?: string}>} props.waypoints — available waypoints
 * @param {Function} props.onAddToRoute — called with ordered selected waypoints
 */
export function WaypointPicker({ visible, onClose, waypoints = [], onAddToRoute }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [selected, setSelected] = useState([]);

  // Reset selection when modal opens
  useEffect(() => {
    if (visible) setSelected([]);
  }, [visible]);

  const toggleWaypoint = (wp) => {
    setSelected((prev) => {
      const idx = prev.findIndex((s) => s.lat === wp.lat && s.lon === wp.lon);
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, wp];
    });
  };

  const isSelected = (wp) =>
    selected.some((s) => s.lat === wp.lat && s.lon === wp.lon);

  const selectedIndex = (wp) =>
    selected.findIndex((s) => s.lat === wp.lat && s.lon === wp.lon);

  const moveUp = (idx) => {
    if (idx <= 0) return;
    setSelected((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx) => {
    if (idx >= selected.length - 1) return;
    setSelected((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleAdd = () => {
    if (selected.length < 2) return;
    notifySuccess();
    onAddToRoute(selected);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t('map.route')}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border2 }]} />

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {waypoints.length === 0 && (
              <Text style={[styles.empty, { color: colors.text4 }]}>
                {t('waypoints.noWaypoints')}
              </Text>
            )}
            {waypoints.map((wp, idx) => {
              const checked = isSelected(wp);
              const selIdx = selectedIndex(wp);
              return (
                <TouchableOpacity
                  key={`wp-${idx}`}
                  style={[
                    styles.row,
                    { borderColor: checked ? colors.accent : colors.border2 },
                  ]}
                  onPress={() => toggleWaypoint(wp)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={wp.name || wp.mgrs || `Waypoint ${idx + 1}`}
                >
                  <View style={[styles.checkbox, { borderColor: colors.border }]}>
                    {checked && (
                      <View style={[styles.checkFill, { backgroundColor: colors.accent }]} />
                    )}
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={[styles.wpName, { color: colors.text }]} numberOfLines={1}>
                      {wp.name || `WP ${idx + 1}`}
                    </Text>
                    {wp.mgrs ? (
                      <Text style={[styles.wpMgrs, { color: colors.text4 }]} numberOfLines={1}>
                        {wp.mgrs}
                      </Text>
                    ) : null}
                  </View>
                  {checked && (
                    <View style={styles.orderControls}>
                      <Text style={[styles.orderNum, { color: colors.accent }]}>
                        {selIdx + 1}
                      </Text>
                      <TouchableOpacity
                        onPress={() => moveUp(selIdx)}
                        style={[styles.arrowBtn, { borderColor: colors.border2 }]}
                        accessibilityLabel="Move up"
                      >
                        <Text style={[styles.arrow, { color: colors.text }]}>{'▲'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveDown(selIdx)}
                        style={[styles.arrowBtn, { borderColor: colors.border2 }]}
                        accessibilityLabel="Move down"
                      >
                        <Text style={[styles.arrow, { color: colors.text }]}>{'▼'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Selected order summary */}
          {selected.length > 0 && (
            <View style={[styles.summary, { borderTopColor: colors.border2 }]}>
              <Text style={[styles.summaryText, { color: colors.text4 }]}>
                {selected.length} {t('map.legs')}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: selected.length >= 2 ? colors.accent : colors.border2,
                borderColor: colors.border,
              },
            ]}
            onPress={handleAdd}
            disabled={selected.length < 2}
            accessibilityRole="button"
            accessibilityLabel={t('map.addToRoute')}
          >
            <Text style={[styles.primaryBtnText, { color: selected.length >= 2 ? colors.bg : colors.text4 }]}>
              {t('map.addToRoute')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('waypointModal.cancel')}
          >
            <Text style={[styles.cancelBtnText, { color: colors.text4 }]}>
              {t('waypointModal.cancel')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  sheet: {
    borderTopWidth: 1,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 14,
    letterSpacing: 5,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  divider: { height: 1, marginBottom: 12 },
  list: { maxHeight: 320 },
  empty: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 2,
    textAlign: 'center',
    paddingVertical: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 10,
    marginBottom: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkFill: {
    width: 12,
    height: 12,
  },
  rowContent: { flex: 1 },
  wpName: {
    fontFamily: 'monospace',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '600',
  },
  wpMgrs: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
  },
  orderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderNum: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 4,
  },
  arrowBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 10,
  },
  summary: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  summaryText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    textAlign: 'center',
  },
  primaryBtn: {
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    fontFamily: 'monospace',
    fontSize: 14,
    letterSpacing: 4,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 3,
  },
});
