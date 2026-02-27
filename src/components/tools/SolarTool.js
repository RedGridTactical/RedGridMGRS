import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { solarBearing, lunarBearing } from '../../utils/tactical';
import { ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';

const RED = '#CC0000', RED2 = '#990000', RED3 = '#660000', RED4 = '#330000';

export function SolarTool({ location }) {
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
        <TouchableOpacity style={[styles.toggleBtn, body==='sun' && styles.toggleActive]} onPress={() => setBody('sun')}>
          <Text style={[styles.toggleText, body==='sun' && styles.toggleTextActive]}>☀ SUN</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, body==='moon' && styles.toggleActive]} onPress={() => setBody('moon')}>
          <Text style={[styles.toggleText, body==='moon' && styles.toggleTextActive]}>☽ MOON</Text>
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

const RED5 = '#1A0000';
const styles = StyleSheet.create({
  toggle: { flexDirection:'row', gap:8, marginBottom:12 },
  toggleBtn: { flex:1, borderWidth:1, borderColor:RED4, paddingVertical:9, alignItems:'center' },
  toggleActive: { borderColor:RED2, backgroundColor:RED5 },
  toggleText: { fontFamily:'monospace', fontSize:10, letterSpacing:3, color:RED4 },
  toggleTextActive: { color:RED },
  results: { marginTop:12, gap:8 },
});
