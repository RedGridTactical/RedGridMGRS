import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import { useBarometer } from '../../hooks/useBarometer';
import { TENDENCY, STORM_RISK, MIN_TREND_WINDOW_MS } from '../../utils/barometer';

const TENDENCY_KEY = {
  [TENDENCY.RISING_RAPIDLY]: 'baro.risingRapidly',
  [TENDENCY.RISING]: 'baro.rising',
  [TENDENCY.STEADY]: 'baro.steady',
  [TENDENCY.FALLING]: 'baro.falling',
  [TENDENCY.FALLING_RAPIDLY]: 'baro.fallingRapidly',
};

const RISK_KEY = {
  [STORM_RISK.LOW]: 'baro.riskLow',
  [STORM_RISK.MODERATE]: 'baro.riskModerate',
  [STORM_RISK.HIGH]: 'baro.riskHigh',
  [STORM_RISK.SEVERE]: 'baro.riskSevere',
  [STORM_RISK.UNKNOWN]: 'baro.riskUnknown',
};

export function BarometerTool({ location }) {
  const colors = useColors();
  const { t } = useTranslation();
  const { available, pressure, seaLevel, baroAltitude, readings, trend, risk, reset } = useBarometer(location);

  if (available === null) {
    return <ToolHint text={t('baro.checking')} />;
  }
  if (available === false) {
    return <ToolHint text={t('baro.unavailable')} />;
  }

  const fmt = (v, dp = 1) => (v == null ? '—' : v.toFixed(dp));
  const minutes = trend ? Math.round(trend.spanMs / 60000) : 0;
  const needMin = Math.round(MIN_TREND_WINDOW_MS / 60000);

  // Only a confident call gets the alarm colour; everything else stays neutral
  // so the display never implies certainty it does not have.
  const riskColor = risk.confident && (risk.level === STORM_RISK.SEVERE || risk.level === STORM_RISK.HIGH)
    ? colors.text
    : colors.text3;

  return (
    <View>
      <ToolResult label={t('baro.pressure')} value={pressure == null ? '—' : `${fmt(pressure)} hPa`} primary />

      {seaLevel != null && <ToolRow label={t('baro.seaLevel')} value={`${fmt(seaLevel)} hPa`} />}
      {baroAltitude != null && <ToolRow label={t('baro.baroAltitude')} value={`${Math.round(baroAltitude)} m`} />}

      <ToolDivider />

      {!trend || !trend.reliable ? (
        <ToolHint text={t('baro.collecting', { have: minutes, need: needMin })} />
      ) : (
        <>
          <ToolRow label={t('baro.tendency')} value={t(TENDENCY_KEY[trend.tendency])} />
          <ToolRow label={t('baro.rate')} value={`${trend.hPaPerHour > 0 ? '+' : ''}${trend.hPaPerHour} hPa/h`} />
          <View style={styles.riskRow}>
            <Text style={[styles.riskLabel, { color: colors.text3 }]}>{t('baro.stormRisk')}</Text>
            <Text style={[styles.riskValue, { color: riskColor }]}>{t(RISK_KEY[risk.level])}</Text>
          </View>
          {!trend.altitudeCorrected && <ToolHint text={t('baro.noAltitude')} />}
          {risk.reason === 'altitude_uncorrected' && <ToolHint text={t('baro.downgraded')} />}
        </>
      )}

      <ToolDivider />
      <View style={styles.footRow}>
        <Text style={[styles.samples, { color: colors.text4 }]}>
          {t('baro.samples', { count: readings.length })}
        </Text>
        <TouchableOpacity
          onPress={reset}
          accessibilityRole="button"
          accessibilityLabel={t('baro.reset')}
        >
          <Text style={[styles.resetBtn, { color: colors.border }]}>{t('baro.reset')}</Text>
        </TouchableOpacity>
      </View>
      <ToolHint text={t('baro.disclaimer')} />
    </View>
  );
}

const styles = StyleSheet.create({
  riskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  riskLabel: { fontSize: 10, letterSpacing: 2 },
  riskValue: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  samples: { fontSize: 9, letterSpacing: 1 },
  resetBtn: { fontSize: 10, letterSpacing: 2, paddingVertical: 6, paddingHorizontal: 4 },
});
