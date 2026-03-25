/**
 * ThemeContext — Provides the active colour palette to all components.
 * Wrap the app in <ThemeProvider colors={themeData.colors}> and call
 * useColors() in any component to get the current theme's colour map.
 */
import React, { createContext, useContext } from 'react';

const ThemeContext = createContext(null);

/**
 * ThemeProvider — place at the top of the component tree.
 * @param {object} colors — the `colors` object from a THEMES entry
 */
export function ThemeProvider({ colors, children }) {
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}

/**
 * useColors — returns the active theme's colour map.
 * Falls back to the red (default) palette when called outside a provider.
 */
export function useColors() {
  const colors = useContext(ThemeContext);
  if (!colors) {
    // Fallback: red theme defaults (matches THEMES.red.colors in useTheme.js)
    return {
      bg:      '#000000',
      text:    '#CC0000',
      text2:   '#BB3333',
      text3:   '#AA2222',
      text4:   '#330000',
      text5:   '#1A0000',
      accent:  '#CC0000',
      card:    '#000000',
      card2:   '#110000',
      border:  '#660000',
      border2: '#330000',
    };
  }
  return colors;
}
