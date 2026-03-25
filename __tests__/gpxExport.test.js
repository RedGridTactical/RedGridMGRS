/**
 * Test suite for src/utils/gpxExport.js
 * Tests GPX and KML XML generation from waypoint data.
 */

const { exportAsGPX, exportAsKML } = require('../src/utils/gpxExport');

const sampleWaypoints = [
  { label: 'ALPHA', mgrs: '18S UJ 23480 06889', lat: 38.8895, lon: -77.0353 },
  { label: 'BRAVO', mgrs: '18S UJ 12345 67890', lat: 38.897, lon: -77.043 },
];

describe('gpxExport.js - GPX/KML Export', () => {

  // ─── GPX Output ───────────────────────────────────────────────────────

  describe('exportAsGPX', () => {

    test('returns valid GPX XML with correct header', () => {
      const gpx = exportAsGPX(sampleWaypoints, 'TEST ROUTE');
      expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(gpx).toContain('<gpx version="1.1"');
      expect(gpx).toContain('creator="Red Grid MGRS"');
      expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    });

    test('includes metadata name', () => {
      const gpx = exportAsGPX(sampleWaypoints, 'PATROL ROUTE');
      expect(gpx).toContain('<name>PATROL ROUTE</name>');
    });

    test('includes waypoint entries with correct lat/lon', () => {
      const gpx = exportAsGPX(sampleWaypoints, 'TEST');
      expect(gpx).toContain('lat="38.8895"');
      expect(gpx).toContain('lon="-77.0353"');
      expect(gpx).toContain('<name>ALPHA</name>');
      expect(gpx).toContain('<name>BRAVO</name>');
    });

    test('includes MGRS in description', () => {
      const gpx = exportAsGPX(sampleWaypoints, 'TEST');
      expect(gpx).toContain('<desc>18S UJ 23480 06889</desc>');
    });

    test('handles empty waypoints array', () => {
      const gpx = exportAsGPX([], 'EMPTY');
      expect(gpx).toContain('<?xml version="1.0"');
      expect(gpx).toContain('<gpx');
      expect(gpx).toContain('<name>EMPTY</name>');
      expect(gpx).not.toContain('<wpt');
    });

    test('handles undefined/null waypoints', () => {
      expect(() => exportAsGPX(undefined, 'TEST')).not.toThrow();
      expect(() => exportAsGPX(null, 'TEST')).not.toThrow();
    });

    test('escapes XML special characters in name', () => {
      const gpx = exportAsGPX([], 'ROUTE <A> & "B"');
      expect(gpx).toContain('ROUTE &lt;A&gt; &amp; &quot;B&quot;');
    });

    test('uses default name when none provided', () => {
      const gpx = exportAsGPX([]);
      expect(gpx).toContain('<name>Red Grid Export</name>');
    });
  });

  // ─── KML Output ───────────────────────────────────────────────────────

  describe('exportAsKML', () => {

    test('returns valid KML XML with correct header', () => {
      const kml = exportAsKML(sampleWaypoints, 'TEST ROUTE');
      expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2"');
      expect(kml).toContain('<Document>');
    });

    test('includes document name', () => {
      const kml = exportAsKML(sampleWaypoints, 'OBJ SET ALPHA');
      expect(kml).toContain('<name>OBJ SET ALPHA</name>');
    });

    test('includes Placemark entries with correct coordinates', () => {
      const kml = exportAsKML(sampleWaypoints, 'TEST');
      expect(kml).toContain('<Placemark>');
      // KML uses lon,lat,alt order
      expect(kml).toContain('<coordinates>-77.0353,38.8895,0</coordinates>');
      expect(kml).toContain('<name>ALPHA</name>');
      expect(kml).toContain('<name>BRAVO</name>');
    });

    test('includes MGRS in description', () => {
      const kml = exportAsKML(sampleWaypoints, 'TEST');
      expect(kml).toContain('<description>18S UJ 23480 06889</description>');
    });

    test('handles empty waypoints array', () => {
      const kml = exportAsKML([], 'EMPTY');
      expect(kml).toContain('<?xml version="1.0"');
      expect(kml).toContain('<kml');
      expect(kml).toContain('<name>EMPTY</name>');
      expect(kml).not.toContain('<Placemark');
    });

    test('handles undefined/null waypoints', () => {
      expect(() => exportAsKML(undefined, 'TEST')).not.toThrow();
      expect(() => exportAsKML(null, 'TEST')).not.toThrow();
    });

    test('escapes XML special characters', () => {
      const kml = exportAsKML([], 'ROUTE <A> & "B"');
      expect(kml).toContain('ROUTE &lt;A&gt; &amp; &quot;B&quot;');
    });
  });

  // ─── Coordinate Conversion ────────────────────────────────────────────

  describe('coordinate conversion from MGRS', () => {

    test('exports waypoint with only MGRS (no lat/lon)', () => {
      const wps = [{ label: 'GRID ONLY', mgrs: '18SUJ2348006889' }];
      const gpx = exportAsGPX(wps, 'TEST');
      expect(gpx).toContain('<wpt');
      expect(gpx).toContain('lat=');
      expect(gpx).toContain('lon=');
      expect(gpx).toContain('<name>GRID ONLY</name>');
    });

    test('KML exports waypoint with only MGRS', () => {
      const wps = [{ label: 'GRID ONLY', mgrs: '18SUJ2348006889' }];
      const kml = exportAsKML(wps, 'TEST');
      expect(kml).toContain('<Placemark>');
      expect(kml).toContain('<coordinates>');
      expect(kml).toContain('<name>GRID ONLY</name>');
    });

    test('skips waypoints with invalid/missing coordinates', () => {
      const wps = [
        { label: 'BAD', mgrs: 'INVALID' },
        { label: 'GOOD', mgrs: '18SUJ2348006889', lat: 38.8895, lon: -77.0353 },
      ];
      const gpx = exportAsGPX(wps, 'TEST');
      expect(gpx).not.toContain('<name>BAD</name>');
      expect(gpx).toContain('<name>GOOD</name>');
    });

    test('prefers explicit lat/lon over MGRS conversion', () => {
      const wps = [{ label: 'EXPLICIT', mgrs: '18SUJ2348006889', lat: 40.0, lon: -75.0 }];
      const gpx = exportAsGPX(wps, 'TEST');
      expect(gpx).toContain('lat="40"');
      expect(gpx).toContain('lon="-75"');
    });
  });
});
