import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { resection } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';

// Minimal MGRS → latlon for input parsing (reused from WaypointModal)
function parseMGRS(mgrs) {
  try {
    const m = mgrs.replace(/\s+/g,'').toUpperCase().match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{4,10})$/i);
    if (!m) return null;
    const [,zStr,band,sq,nums] = m;
    const zone = parseInt(zStr,10), half = Math.floor(nums.length/2);
    const scale = Math.pow(10, 5-half);
    const e = parseInt(nums.slice(0,half),10)*scale, n = parseInt(nums.slice(half),10)*scale;
    const setNum = ((zone-1)%6)+1;
    const colSet = ['ABCDEFGH','JKLMNPQR','STUVWXYZ'][Math.floor((setNum-1)/2)];
    const rowSet = ['ABCDEFGHJKLMNPQRSTUV','FGHJKLMNPQRSTUVABCDE'][(setNum-1)%2];
    const ci = colSet.indexOf(sq[0]), ri = rowSet.indexOf(sq[1]);
    if (ci<0||ri<0) return null;
    const fe = (ci+1)*100000+e;
    const bMin = 'CDEFGHJKLMNPQRSTUVWX'.indexOf(band.toUpperCase())*8-80;
    const lR = ((bMin+4)*Math.PI/180);
    const a=6378137,f=1/298.257223563,e2=2*f-f*f;
    const Mapx = a*((1-e2/4-(3*e2**2)/64)*lR-((3*e2)/8+(3*e2**2)/32)*Math.sin(2*lR));
    let fn = Math.round(Mapx/2000000)*2000000 + ri*100000+n;
    if (bMin<0) fn-=10000000;
    const k0=0.9996,ep2=e2/(1-e2),lo=((zone-1)*6-180+3)*(Math.PI/180);
    const M=fn/k0, mu=M/(a*(1-e2/4-(3*e2**2)/64-(5*e2**3)/256));
    const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
    const p1=mu+(3*e1)/2*Math.sin(2*mu)+(27*e1**2)/16*Math.sin(4*mu)+(151*e1**3)/96*Math.sin(6*mu);
    const N1=a/Math.sqrt(1-e2*Math.sin(p1)**2), T1=Math.tan(p1)**2, C1=ep2*Math.cos(p1)**2;
    const R1=(a*(1-e2))/(1-e2*Math.sin(p1)**2)**1.5, D=(fe-500000)/(N1*k0);
    const lat=p1-(N1*Math.tan(p1))/R1*(D**2/2-((5+3*T1+10*C1-4*C1**2-9*ep2)*D**4)/24+((61+90*T1+298*C1+45*T1**2-252*ep2-3*C1**2)*D**6)/720);
    const lon=lo+(D-((1+2*T1+C1)*D**3)/6+((5-2*C1+28*T1-3*C1**2+8*ep2+24*T1**2)*D**5)/120)/Math.cos(p1);
    return { lat:(lat*180/Math.PI), lon:(lon*180/Math.PI) };
  } catch { return null; }
}

export function ResectionTool() {
  const [pt1MGRS, setPt1MGRS]   = useState('');
  const [bearing1, setBearing1] = useState('');
  const [pt2MGRS, setPt2MGRS]   = useState('');
  const [bearing2, setBearing2] = useState('');

  const result = useMemo(() => {
    const b1 = parseFloat(bearing1), b2 = parseFloat(bearing2);
    if (isNaN(b1)||isNaN(b2)) return null;
    const p1 = parseMGRS(pt1MGRS), p2 = parseMGRS(pt2MGRS);
    if (!p1||!p2) return null;
    return resection(p1.lat, p1.lon, b1, p2.lat, p2.lon, b2);
  }, [pt1MGRS, bearing1, pt2MGRS, bearing2]);

  return (
    <View>
      <ToolHint text={'Identify two terrain features on your map.\nTake a compass bearing to each.\nEnter their MGRS and your bearing — app computes your position.'} />
      <ToolDivider />
      <Text style={styles.ptLabel}>POINT 1</Text>
      <ToolInput label="KNOWN POINT 1 — MGRS" value={pt1MGRS} onChangeText={setPt1MGRS} placeholder="18S UJ 12345 67890" />
      <ToolInput label="YOUR BEARING TO PT 1 (°)" value={bearing1} onChangeText={setBearing1} placeholder="0 – 360" keyboardType="numeric" />
      <ToolDivider />
      <Text style={styles.ptLabel}>POINT 2</Text>
      <ToolInput label="KNOWN POINT 2 — MGRS" value={pt2MGRS} onChangeText={setPt2MGRS} placeholder="18S UJ 98765 43210" />
      <ToolInput label="YOUR BEARING TO PT 2 (°)" value={bearing2} onChangeText={setBearing2} placeholder="0 – 360" keyboardType="numeric" />

      {result && (
        <View style={styles.results}>
          <ToolResult label="YOUR POSITION" value={result.mgrsFormatted} primary />
        </View>
      )}
      {!result && pt1MGRS && bearing1 && pt2MGRS && bearing2 && (
        <ToolHint text="COULD NOT SOLVE — CHECK INPUTS. BEARINGS MAY BE PARALLEL." />
      )}
    </View>
  );
}

const RED3 = '#660000';
const styles = StyleSheet.create({
  ptLabel: { fontFamily:'monospace', fontSize:9, letterSpacing:4, color:RED3, marginBottom:6, marginTop:4 },
  results: { marginTop:12, gap:8 },
});
