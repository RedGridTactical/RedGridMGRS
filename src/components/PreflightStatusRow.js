/**
 * PreflightStatusRow — single status line for the Mission Preflight panel.
 *
 * Layout (left → right):
 *   • Label (e.g. "GPS source")           dim text
 *   • Value (e.g. "External — Garmin GLO") main text
 *   • Status chip ("OK" / "WARN" / "FAIL") small colored pill on the right
 *
 * Status mapping is intentionally tactical: green = ready, amber = degraded
 * but usable, red = blocks the mission. We use the theme's `accent` / amber /
 * danger tokens with a graceful fallback when a theme doesn't define one.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useColors } from '../utils/ThemeContext';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {'ok'|'warn'|'fail'|'idle'} props.status  defaults to 'idle'
 * @param {string} [props.actionLabel] — optional button on the right (e.g. "FIX")
 * @param {function} [props.onAction] — handler for the action button
 */
export function PreflightStatusRow({ label, value, status = 'idle', actionLabel, onAction }) {
  const colors = useColors();

  const chip = chipColors(colors, status);

  return (
    <View style={[styles.row, { borderColor: colors.border2 }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}. Status ${status}.`}
    >
      <View style={styles.textCol}>
        <Text style={[styles.label, { color: colors.text3 }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]} numberOfLines={2}>{value}</Text>
      </View>

      <View style={styles.rightCol}>
        <View style={[styles.chip, { backgroundColor: chip.bg, borderColor: chip.border }]}>
          <Text style={[styles.chipText, { color: chip.fg }]}>{chipLabel(status)}</Text>
        </View>
        {actionLabel ? (
          onAction ? (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.accent }]}
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel} for ${label}`}
            >
              <Text style={[styles.actionText, { color: colors.accent }]}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.actionBtn, styles.staticAction, { borderColor: colors.border }]}>
              <Text style={[styles.actionText, { color: colors.text3 }]}>{actionLabel}</Text>
            </View>
          )
        ) : null}
      </View>
    </View>
  );
}

function chipLabel(status) {
  switch (status) {
    case 'ok':   return 'OK';
    case 'warn': return 'WARN';
    case 'fail': return 'FAIL';
    default:     return '—';
  }
}

function chipColors(colors, status) {
  // Themes don't always export amber/danger — derive sensible fallbacks.
  const amber = colors.warn || '#d99a3a';
  const danger = colors.danger || '#cc4444';

  switch (status) {
    case 'ok':
      return { bg: 'transparent', border: colors.accent, fg: colors.accent };
    case 'warn':
      return { bg: 'transparent', border: amber, fg: amber };
    case 'fail':
      return { bg: 'transparent', border: danger, fg: danger };
    default:
      return { bg: 'transparent', border: colors.border, fg: colors.text3 };
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  textCol: { flex: 1, paddingRight: 10 },
  rightCol: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  value: {
    fontFamily: 'monospace',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 2,
    minWidth: 48,
    alignItems: 'center',
  },
  chipText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  actionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 2,
  },
  staticAction: {
    opacity: 0.8,
  },
  actionText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
});
