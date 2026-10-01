import { previewWaypointImport, parseGPX, parseKML, MAX_IMPORT_BYTES } from '../src/utils/gpxImport';
import { exportAsGPX, exportAsKML } from '../src/utils/gpxExport';

const preview = (xml, options = {}) => previewWaypointImport(xml, options);
const gpx = content => `<gpx xmlns="http://www.topografix.com/GPX/1/1">${content}</gpx>`;

test('legal namespace prefixes, single quotes, attribute order and self-closing points import', () => {
  const xml = `<?xml version="1.0"?><g:gpx xmlns:g='http://www.topografix.com/GPX/1/1'><!--field-->
    <g:wpt lon='0' lat='0'/><g:rte><g:rtept lon='2' lat='1'><g:name><![CDATA[A & B]]></g:name><g:ele>0</g:ele></g:rtept></g:rte></g:gpx>`;
  const result = preview(xml);
  expect(result.errors).toEqual([]); expect(result.counts.accepted).toBe(2);
  expect(result.points[0]).toMatchObject({ lat: 0, lon: 0, source: 'import' });
  expect(result.points[1]).toMatchObject({ label: 'A & B', elevation: 0 });
});
test('entities decode once, including numeric Unicode, without expanding escaped content', () => {
  const result = preview(gpx('<wpt lat="1" lon="2"><name>&amp;lt; &#x1F6A9; &#65;</name></wpt>'));
  expect(result.points[0].label).toBe('&lt; 🚩 A');
});
test.each(['Infinity', 'NaN', '1junk', '', '1e999', '90', '-81'])('invalid or unsupported latitude %s is rejected with explicit count', value => {
  const result = preview(gpx(`<wpt lat="${value}" lon="0"/><wpt lat="0" lon="0"/>`));
  expect(result.counts).toEqual({ total: 2, accepted: 1, rejected: 1, truncated: 0, duplicates: 0 });
});
test.each(['181', '-181', 'NaN', '2degrees'])('invalid longitude %s is rejected', value => {
  expect(preview(gpx(`<wpt lat="0" lon="${value}"/>`)).counts.rejected).toBe(1);
});
test('preview counts duplicates, invalid points and points beyond capacity before any commit', () => {
  const result = preview(gpx('<wpt lat="1" lon="2"><name>A</name></wpt><wpt lat="1" lon="2"><name>A</name></wpt>'
    + '<wpt lat="2" lon="2"><name>B</name></wpt><wpt lat="3" lon="2"/><wpt lat="999" lon="2"/>'), { limit: 1 });
  expect(result.counts).toEqual({ total: 5, accepted: 1, duplicates: 1, truncated: 2, rejected: 1 });
});
test('existing-list duplicate comparison uses coordinates and label, leaving distinct named points intact', () => {
  const xml = gpx('<wpt lat="1" lon="2"><name>A</name></wpt><wpt lat="1" lon="2"><name>B</name></wpt>');
  const result = preview(xml, { existingPoints: [{ lat: 1, lon: 2, label: 'A' }] });
  expect(result.counts.duplicates).toBe(1); expect(result.points[0].label).toBe('B');
});
test.each([
  '<gpx><wpt lat="1" lon="2"></gpx>', '<gpx><wpt lat="1"lat="2" lon="2"/></gpx>',
  '<gpx><wpt lat="1" lon="2"/></gpx><gpx/>', '<gpx><wpt lat="1" lon="2"><name>&unknown;</name></wpt></gpx>',
  '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///secret">]><gpx/>', '<gpx><x:wpt lat="1" lon="2"/></gpx>',
])('malformed or external-entity XML fails closed (%s)', xml => {
  const result = preview(xml); expect(result.points).toEqual([]); expect(result.errors).not.toHaveLength(0);
});
test('byte and depth bounds reject the entire file instead of partially importing it', () => {
  expect(preview(gpx('a'.repeat(MAX_IMPORT_BYTES))).errors).toContain('IMPORT_TOO_LARGE');
  expect(preview(gpx('漢'.repeat(Math.ceil(MAX_IMPORT_BYTES / 3)))).errors).toContain('IMPORT_TOO_LARGE');
  expect(preview('<gpx>' + '<x>'.repeat(65) + '</x>'.repeat(65) + '</gpx>').errors).not.toHaveLength(0);
});
test('KML namespaces, attributes and zero elevation work; unsupported and multi-coordinate geometry count as rejected', () => {
  const result = preview(`<k:kml xmlns:k='http://www.opengis.net/kml/2.2'><k:Document>
    <k:Placemark id='zero'><k:name>ZERO</k:name><k:Point><k:coordinates>0, 0, 0</k:coordinates></k:Point></k:Placemark>
    <k:Placemark><k:LineString><k:coordinates>0,0 1,1</k:coordinates></k:LineString></k:Placemark>
    <k:Placemark><k:Point><k:coordinates>0,0 1,1</k:coordinates></k:Point></k:Placemark>
  </k:Document></k:kml>`);
  expect(result.counts).toMatchObject({ total: 3, accepted: 1, rejected: 2 });
  expect(result.points[0]).toMatchObject({ lat: 0, lon: 0, elevation: 0 });
});
test('tracks are excluded explicitly; multiple route plans produce a merge warning', () => {
  const result = preview(gpx('<rte><rtept lat="1" lon="2"/></rte><rte><rtept lat="3" lon="4"/></rte><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>'));
  expect(result.counts).toMatchObject({ total: 3, accepted: 2, rejected: 1 });
  expect(result.plan).toBeNull(); expect(result.warnings).toContain('MULTIPLE_PLANS');
});
test.each(['gpx', 'kml'])('%s exported route roundtrip preserves order, plan and notes without inventing a GPS sample', format => {
  const plan = { name: 'PLAN', notes: 'Caution & detail', paceMinPerKm: 12, plannedStartAt: 5000, createdAt: 1000, updatedAt: 2000 };
  const points = [{ id: 'a', label: 'FIRST', lat: 0, lon: 0, note: 'Point note', source: 'gps', recordedAt: 1000, accuracyM: 0 }, { id: 'b', label: 'SECOND', lat: 1, lon: 2 }];
  const xml = format === 'gpx' ? exportAsGPX(points, plan.name, plan) : exportAsKML(points, plan.name, plan);
  const result = preview(xml, { format });
  expect(result.errors).toEqual([]); expect(result.plan).toMatchObject(plan);
  expect(result.points.map(item => item.label)).toEqual(['FIRST', 'SECOND']);
  expect(result.points[0]).toMatchObject({ note: 'Point note', source: 'import', recordedAt: 1000, accuracyM: 0 });
});
