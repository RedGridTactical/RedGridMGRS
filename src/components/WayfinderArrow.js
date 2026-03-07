import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useColors } from '../utils/ThemeContext';

/**
 * WayfinderArrow — Animated directional arrow pointing to waypoint.
 * bearing: 0-360 degrees from North
 * size: diameter of the component
 */
export const WayfinderArrow = React.memo(function WayfinderArrow({ bearing, size = 180 }) {
  const colors = useColors();
  const rotateAnim = useRef(new Animated.Value(bearing)).current;
  const prevBearing = useRef(bearing);

  useEffect(() => {
    // Shortest-path rotation to avoid spinning the wrong way
    let delta = bearing - prevBearing.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    const next = prevBearing.current + delta;
    prevBearing.current = next;

    Animated.timing(rotateAnim, {
      toValue: next,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [bearing]);

  const rotate = rotateAnim.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
    extrapolate: 'extend',
  });

  const arrowSize = size * 0.38;
  const shaftWidth = size * 0.09;
  const headWidth = size * 0.24;
  const headHeight = size * 0.28;

  return (
    <View style={[styles.container, { width: size, height: size }]} accessible={true} accessibilityRole="image" accessibilityLabel={`Wayfinder arrow pointing ${Math.round(bearing)} degrees`}>
      {/* Outer ring */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: size * 0.015,
            borderColor: colors.text,
          },
        ]}
      />
      {/* Cardinal ticks */}
      {[0, 90, 180, 270].map((deg) => (
        <View
          key={deg}
          style={[
            styles.tick,
            {
              width: size * 0.012,
              height: size * 0.07,
              top: size * 0.04,
              left: size / 2 - size * 0.006,
              transformOrigin: `${size * 0.006}px ${size * 0.46}px`,
              transform: [{ rotate: `${deg}deg` }],
              backgroundColor: colors.text,
            },
          ]}
        />
      ))}

      {/* Rotating arrow */}
      <Animated.View
        style={[
          styles.arrowContainer,
          { transform: [{ rotate }] },
        ]}
      >
        {/* Arrowhead (pointing up = North = 0 deg) */}
        <View
          style={[
            styles.arrowHead,
            {
              borderLeftWidth: headWidth / 2,
              borderRightWidth: headWidth / 2,
              borderBottomWidth: headHeight,
              borderBottomColor: colors.text,
              marginBottom: -1,
            },
          ]}
        />
        {/* Arrow shaft */}
        <View
          style={[
            styles.arrowShaft,
            {
              width: shaftWidth,
              height: arrowSize,
              backgroundColor: colors.text,
            },
          ]}
        />
        {/* Tail flare */}
        <View
          style={[
            styles.tailFlare,
            {
              width: shaftWidth * 1.8,
              height: shaftWidth * 0.5,
              marginTop: -1,
              backgroundColor: colors.text,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    opacity: 0.5,
  },
  tick: {
    position: 'absolute',
    opacity: 0.6,
  },
  arrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowShaft: {
  },
  tailFlare: {
    opacity: 0.6,
  },
});
