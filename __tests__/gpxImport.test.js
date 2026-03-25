/**
 * Test suite for src/utils/gpxImport.js
 * Tests GPX and KML XML parsing into waypoint arrays.
 */

const { parseGPX, parseKML } = require('../src/utils/gpxImport');

describe('gpxImport.js - GPX/KML Import', () => {

  // ─── GPX Parsing ──────────────────────────────────────────────────────

  describe('parseGPX', () => {

    test('parses standard GPX with waypoints', () => {
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <wpt lat="38.8895" lon="-77.0353">
    <name>ALPHA</name>
    <ele>15.5</ele>
  </wpt>
  <wpt lat="40.7128" lon="-74.0060">
    <name>BRAVO</name>
  </wpt>
</gpx>`;
      const result = parseGPX(gpx);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'ALPHA', lat: 38.8895, lon: -77.0353, elevation: 15.5 });
      expect(result[1]).toEqual({ name: 'BRAVO', lat: 40.7128, lon: -74.006 });
    });

    test('assigns default names when <name> is missing', () => {
      const gpx = `<gpx><wpt lat="38.89" lon="-77.03"></wpt></gpx>`;
      const result = parseGPX(gpx);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('WP 1');
    });

    test('parses elevation from <ele> tag', () => {
      const gpx = `<gpx><wpt lat="38.89" lon="-77.03"><name>HIGH</name><ele>1234.5</ele></wpt></gpx>`;
      const result = parseGPX(gpx);
      expect(result[0].elevation).toBe(1234.5);
    });

    test('handles missing elevation gracefully', () => {
      const gpx = `<gpx><wpt lat="38.89" lon="-77.03"><name>LOW</name></wpt></gpx>`;
      const result = parseGPX(gpx);
      expect(result[0].elevation).toBeUndefined();
    });

    test('unescapes XML entities in names', () => {
      const gpx = `<gpx><wpt lat="38.89" lon="-77.03"><name>ROUTE &amp; &lt;ALPHA&gt;</name></wpt></gpx>`;
      const result = parseGPX(gpx);
      expect(result[0].name).toBe('ROUTE & <ALPHA>');
    });

    test('skips waypoints with invalid lat/lon', () => {
      const gpx = `<gpx>
        <wpt lat="abc" lon="-77.03"><name>BAD</name></wpt>
        <wpt lat="38.89" lon="-77.03"><name>GOOD</name></wpt>
      </gpx>`;
      const result = parseGPX(gpx);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('GOOD');
    });

    test('returns empty array for empty string', () => {
      expect(parseGPX('')).toEqual([]);
    });

    test('returns empty array for null/undefined', () => {
      expect(parseGPX(null)).toEqual([]);
      expect(parseGPX(undefined)).toEqual([]);
    });

    test('returns empty array for non-string input', () => {
      expect(parseGPX(123)).toEqual([]);
      expect(parseGPX({})).toEqual([]);
    });

    test('returns empty array for malformed XML', () => {
      expect(parseGPX('this is not xml at all')).toEqual([]);
      expect(parseGPX('<gpx><broken')).toEqual([]);
    });

    test('returns empty array for GPX with no waypoints', () => {
      const gpx = `<?xml version="1.0"?><gpx><metadata><name>Empty</name></metadata></gpx>`;
      expect(parseGPX(gpx)).toEqual([]);
    });

    test('handles multiple waypoints correctly', () => {
      const gpx = `<gpx>
        <wpt lat="1.0" lon="2.0"><name>A</name></wpt>
        <wpt lat="3.0" lon="4.0"><name>B</name></wpt>
        <wpt lat="5.0" lon="6.0"><name>C</name></wpt>
      </gpx>`;
      const result = parseGPX(gpx);
      expect(result).toHaveLength(3);
      expect(result[2].lat).toBe(5.0);
      expect(result[2].lon).toBe(6.0);
    });
  });

  // ─── KML Parsing ──────────────────────────────────────────────────────

  describe('parseKML', () => {

    test('parses standard KML with placemarks', () => {
      const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>ALPHA</name>
      <Point><coordinates>-77.0353,38.8895,15.5</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>BRAVO</name>
      <Point><coordinates>-74.0060,40.7128,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
      const result = parseKML(kml);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'ALPHA', lat: 38.8895, lon: -77.0353, elevation: 15.5 });
      expect(result[1]).toEqual({ name: 'BRAVO', lat: 40.7128, lon: -74.006 });
    });

    test('skips elevation of 0', () => {
      const kml = `<kml><Document><Placemark><name>ZERO</name><Point><coordinates>-77.0,38.0,0</coordinates></Point></Placemark></Document></kml>`;
      const result = parseKML(kml);
      expect(result[0].elevation).toBeUndefined();
    });

    test('assigns default names when <name> is missing', () => {
      const kml = `<kml><Document><Placemark><Point><coordinates>-77.03,38.89</coordinates></Point></Placemark></Document></kml>`;
      const result = parseKML(kml);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('WP 1');
    });

    test('handles coordinates without altitude', () => {
      const kml = `<kml><Document><Placemark><name>NO ALT</name><Point><coordinates>-77.03,38.89</coordinates></Point></Placemark></Document></kml>`;
      const result = parseKML(kml);
      expect(result).toHaveLength(1);
      expect(result[0].lat).toBeCloseTo(38.89);
      expect(result[0].lon).toBeCloseTo(-77.03);
      expect(result[0].elevation).toBeUndefined();
    });

    test('skips non-Point placemarks (LineString, Polygon)', () => {
      const kml = `<kml><Document>
        <Placemark><name>LINE</name><LineString><coordinates>-77,38 -76,39</coordinates></LineString></Placemark>
        <Placemark><name>POINT</name><Point><coordinates>-77.03,38.89,0</coordinates></Point></Placemark>
      </Document></kml>`;
      const result = parseKML(kml);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('POINT');
    });

    test('unescapes XML entities in names', () => {
      const kml = `<kml><Document><Placemark><name>OBJ &amp; &lt;SET&gt;</name><Point><coordinates>-77.03,38.89</coordinates></Point></Placemark></Document></kml>`;
      const result = parseKML(kml);
      expect(result[0].name).toBe('OBJ & <SET>');
    });

    test('returns empty array for empty string', () => {
      expect(parseKML('')).toEqual([]);
    });

    test('returns empty array for null/undefined', () => {
      expect(parseKML(null)).toEqual([]);
      expect(parseKML(undefined)).toEqual([]);
    });

    test('returns empty array for non-string input', () => {
      expect(parseKML(123)).toEqual([]);
      expect(parseKML({})).toEqual([]);
    });

    test('returns empty array for malformed XML', () => {
      expect(parseKML('not xml')).toEqual([]);
      expect(parseKML('<kml><broken')).toEqual([]);
    });

    test('returns empty array for KML with no placemarks', () => {
      const kml = `<?xml version="1.0"?><kml><Document><name>Empty</name></Document></kml>`;
      expect(parseKML(kml)).toEqual([]);
    });

    test('handles multiple placemarks correctly', () => {
      const kml = `<kml><Document>
        <Placemark><name>A</name><Point><coordinates>2.0,1.0</coordinates></Point></Placemark>
        <Placemark><name>B</name><Point><coordinates>4.0,3.0</coordinates></Point></Placemark>
        <Placemark><name>C</name><Point><coordinates>6.0,5.0,100</coordinates></Point></Placemark>
      </Document></kml>`;
      const result = parseKML(kml);
      expect(result).toHaveLength(3);
      expect(result[2]).toEqual({ name: 'C', lat: 5.0, lon: 6.0, elevation: 100 });
    });

    test('skips placemarks with invalid coordinates', () => {
      const kml = `<kml><Document>
        <Placemark><name>BAD</name><Point><coordinates>abc,def</coordinates></Point></Placemark>
        <Placemark><name>GOOD</name><Point><coordinates>-77.03,38.89</coordinates></Point></Placemark>
      </Document></kml>`;
      const result = parseKML(kml);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('GOOD');
    });
  });
});
