/**
 * RouteOverlay — Renders a route as connected polylines on a react-native-maps MapView.
 * Draw lines between consecutive waypoints with distance labels per segment.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Polyline, Marker } from 'react-native-maps';
import { formatDistance } from '../utils/mgrs';
import { calculateDistance } from '../utils/mgrs';
import { useTranslation } from '../hooks/useTranslation';

/**
 * @param {object} props
 * @param {Array<{lat: number, lon: number, name?: string}>} props.waypoints
 * @param {object} props.colors — from useColors()
 */
export function RouteOverlay({ waypoints, colors }) {
  const { t } = useTranslation();

  if (!waypoints || waypoints.length < 2) return null;

  const coordinates = waypoints.map((wp) => ({
    latitude: wp.lat,
    longitude: wp.lon,
  }));

  // Calculate total route distance
  let totalDistance = 0;
  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dist = calculateDistance(
      waypoints[i].lat, waypoints[i].lon,
      waypoints[i + 1].lat, waypoints[i + 1].lon
    );
    totalDistance += dist;
    segments.push({
      midLat: (waypoints[i].lat + waypoints[i + 1].lat) / 2,
      midLon: (waypoints[i].lon + waypoints[i + 1].lon) / 2,
      distance: dist,
    });
  }

  return (
    <>
      {/* Route polyline */}
      <Polyline
        coordinates={coordinates}
        strokeColor={colors.accent}
        strokeWidth={3}
        lineDashPattern={[8, 4]}
      />

      {/* Distance labels on each segment */}
      {segments.map((seg, idx) => (
        <Marker
          key={`seg-${idx}`}
          coordinate={{ latitude: seg.midLat, longitude: seg.midLon }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={[styles.label, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            <Text style={[styles.labelText, { color: colors.text }]}>
              {formatDistance(seg.distance)}
            </Text>
          </View>
        </Marker>
      ))}

      {/* Total distance label at the last waypoint */}
      <Marker
        coordinate={{
          latitude: waypoints[waypoints.length - 1].lat,
          longitude: waypoints[waypoints.length - 1].lon,
        }}
        anchor={{ x: 0.5, y: -0.5 }}
        tracksViewChanges={false}
      >
        <View style={[styles.totalLabel, { backgroundColor: colors.accent }]}>
          <Text style={[styles.totalText, { color: colors.bg }]}>
            {t('map.totalDistance')}: {formatDistance(totalDistance)}
          </Text>
        </View>
      </Marker>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 2,
  },
  labelText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '600',
  },
  totalLabel: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  totalText: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
  },
});
