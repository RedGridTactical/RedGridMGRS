import { useSessionDraft } from '../../hooks/useSessionDraft';
import { validToolPoint } from '../../utils/toolWorkflow';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { solarBearing, lunarBearing, formatBearing } from '../../utils/tactical';
import { ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import { TYPE } from '../../utils/typography';

export function SolarTool({ location }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [now, setNow] = useState(new Date());
  const [body, setBody] = useSessionDraft('tool:solar:body', 'sun');

  // Refresh every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  if (!validToolPoint(location)) {
    return <ToolHint text={t('gps.noFixSolar')} />;
  }

  let sun, moon;
  try {
    sun  = solarBearing(now, location.lat, location.lon);
    moon = lunarBearing(now, location.lat, location.lon);
  } catch {
    return <ToolHint text={t('toolLabels.calcError')} />;
  }

  if (!sun || !moon) {
    return <ToolHint text={t('toolLabels.calcError')} />;
  }

  const data = body === 'sun' ? sun : moon;
  if (!Number.isFinite(data.azimuth) || !Number.isFinite(data.altitude)) {
    return <ToolHint text={t('toolLabels.calcError')} />;
  }
  const az = Math.round(data.azimuth) % 360;
  const sunAlt = typeof sun.altitude === 'number' && isFinite(sun.altitude) ? Math.round(sun.altitude) : 0;
  const moonAlt = typeof moon.altitude === 'number' && isFinite(moon.altitude) ? Math.round(moon.altitude) : 0;
  const alt = body === 'sun' ? sunAlt : moonAlt;
  const visible = body === 'sun' ? sun.isDay : moon.isUp;

  // Rough cardinal from azimuth
  const cardinals = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const cardinal = cardinals[Math.round(az/22.5) % 16];

  const timeStr = `${String(now.getUTCHours()).padStart(2,'0')}${String(now.getUTCMinutes()).padStart(2,'0')}Z`;

  return (
    <View>
      <View style={styles.toggle}>
        <TouchableOpacity style={[styles.toggleBtn, { borderColor: colors.border2 }, body==='sun' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setBody('sun')}>
          <Text style={[styles.toggleText, { color: colors.text3 }, body==='sun' && { color: colors.text }]}>☀ {t('toolLabels.sun')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, { borderColor: colors.border2 }, body==='moon' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setBody('moon')}>
          <Text style={[styles.toggleText, { color: colors.text3 }, body==='moon' && { color: colors.text }]}>☽ {t('toolLabels.moon')}</Text>
        </TouchableOpacity>
      </View>

      <ToolHint text={`AS OF ${timeStr} · ${location.lat.toFixed(4)}°, ${location.lon.toFixed(4)}°`} />

      {!visible && (
        <ToolHint text={body === 'sun' ? t('toolLabels.sunBelowHorizon') : t('toolLabels.moonBelowHorizon')} />
      )}

      <View style={styles.results}>
        <ToolResult label={body === 'sun' ? t('toolLabels.sunBearing') : t('toolLabels.moonBearing')} value={`${formatBearing(az, 'true')} (${cardinal})`} primary />
        <ToolResult label={t('toolLabels.elevation')} value={`${alt}°`} />
        <ToolDivider />
        <ToolHint text={body === 'sun'
          ? t('toolLabels.sunHint')
          : t('toolLabels.moonHint')
        } />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection:'row', gap:8, marginBottom:12 },
  toggleBtn: { flex:1, borderWidth:1, paddingVertical:9, alignItems:'center' },
  toggleText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  results: { marginTop:12, gap:8 },
});
