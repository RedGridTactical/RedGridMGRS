import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { solarBearing, lunarBearing } from '../../utils/tactical';
import { ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';

export function SolarTool({ location }) {
  const colors = useColors();
  const [now, setNow] = useState(new Date());
  const [body, setBody] = useState('sun');

  // Refresh every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  if (!location) {
    return <ToolHint text="NO GPS FIX — LOCATION REQUIRED FOR SOLAR BEARING" />;
  }

  const sun  = solarBearing(now, location.lat, location.lon);
  const moon = lunarBearing(now, location.lat, location.lon);

  const data = body === 'sun' ? sun : moon;
  const az = Math.round(data.azimuth);
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
          <Text style={[styles.toggleText, { color: colors.border2 }, body==='sun' && { color: colors.text }]}>☀ SUN</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, { borderColor: colors.border2 }, body==='moon' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setBody('moon')}>
          <Text style={[styles.toggleText, { color: colors.border2 }, body==='moon' && { color: colors.text }]}>☽ MOON</Text>
        </TouchableOpacity>
      </View>

      <ToolHint text={`AS OF ${timeStr} · ${location.lat.toFixed(4)}°, ${location.lon.toFixed(4)}°`} />

      {!visible && (
        <ToolHint text={body === 'sun' ? 'SUN BELOW HORIZON — NIGHT' : 'MOON BELOW HORIZON'} />
      )}

      <View style={styles.results}>
        <ToolResult label={`${body.toUpperCase()} BEARING`} value={`${az}° (${cardinal})`} primary />
        <ToolResult label="ELEVATION" value={`${alt}°`} />
        <ToolDivider />
        <ToolHint text={body === 'sun'
          ? 'FACE THE SUN · SUBTRACT BEARING FROM 180 TO FIND SOUTH · ROTATE FOR NORTH'
          : 'USE MOON AS BEARING REFERENCE · LESS PRECISE THAN SOLAR'
        } />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection:'row', gap:8, marginBottom:12 },
  toggleBtn: { flex:1, borderWidth:1, paddingVertical:9, alignItems:'center' },
  toggleText: { fontFamily:'monospace', fontSize:10, letterSpacing:3 },
  results: { marginTop:12, gap:8 },
});
