# @redgrid/mgrs

DMA TM 8358.1 compliant MGRS coordinate library. Zero dependencies.

## Why This Exists

The widely-used `mgrs` npm package (from proj4js) **rounds** intermediate UTM values before grid truncation, producing coordinates that can be off by one grid square at boundaries. The DMA Technical Manual 8358.1 specifies **truncation**, not rounding, which is what military GPS receivers (DAGR, PLGR) and NGA's GeoTrans implement.

This library matches GeoTrans reference output exactly.

### Comparison: Rounding vs Truncation

| Location | Lat/Lon | proj4js/mgrs | @redgrid/mgrs | GeoTrans Reference |
|---|---|---|---|---|
| White House | 38.8895, -77.0353 | 18SUJ2337606519 | 18SUJ2347806483 | 18SUJ2347806483 |
| Edge case (zone boundary) | 48.0, 3.0 | May differ at boundary | Matches GeoTrans | Reference |

The difference shows up at grid-square boundaries where intermediate easting/northing values are just above a 100,000m threshold. Rounding pushes them into the next square; truncation keeps them in the correct one.

## Install

```bash
npm install @redgrid/mgrs
```

## Quick Start

```js
const { toMGRS, parseMGRS, formatMGRS, bearing, distance } = require('@redgrid/mgrs');

// Lat/lon to MGRS
const mgrs = toMGRS(38.8895, -77.0353);       // "18SUJ2347806483"
const pretty = formatMGRS(mgrs);               // "18S UJ 23478 06483"

// MGRS back to lat/lon
const pos = parseMGRS('18S UJ 23478 06483');   // { lat: 38.8895..., lon: -77.0353... }

// Bearing and distance
const brg = bearing(38.89, -77.04, 48.86, 2.35);  // ~51° (DC to Paris)
const dist = distance(38.89, -77.04, 48.86, 2.35); // ~6163km
```

## API Reference

### `toMGRS(lat, lon, precision?)`

Convert WGS84 decimal degrees to MGRS string. Precision 1-5 (default 5 = 1m).

### `parseMGRS(mgrsString)`

Parse MGRS string (with or without spaces) to `{ lat, lon }`. Returns `null` on invalid input.

### `formatMGRS(mgrs)`

Insert spaces for readability: `"18SUJ2337606519"` -> `"18S UJ 23376 06519"`.

### `toUTM(lat, lon)`

Convert to `{ easting, northing, zone, band }`.

### `bearing(lat1, lon1, lat2, lon2)`

Great-circle bearing in degrees (0-360).

### `distance(lat1, lon1, lat2, lon2)`

Haversine distance in meters.

### `deadReckoning(lat, lon, heading, distanceM)`

Project position. Returns `{ lat, lon }` or `null` for invalid distance.

### `formatDD(lat, lon)`

Decimal degrees string: `"38.889500°\n-77.035300°"`.

### `formatDMS(lat, lon)`

Degrees/minutes/seconds: `"38° 53' 22.2" N\n77° 2' 7.1" W"`.

## FixPhrase

Separate import for the 4-word coordinate encoding (~11m accuracy):

```js
const { encode, decode, formatFixPhrase } = require('@redgrid/mgrs/fixphrase');

const phrase = encode(38.8895, -77.0353);  // "alpha-bravo-charlie-delta"
const pos = decode(phrase);                 // { lat: 38.8895, lon: -77.0353 }
```

Words can be decoded in any order (each word maps to a non-overlapping numeric range).

## License

MIT
