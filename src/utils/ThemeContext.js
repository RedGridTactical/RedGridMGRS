/**
 * ThemeContext — Provides the active colour palette to all components.
 * Wrap the app in <ThemeProvider colors={themeData.colors}> and call
 * useColors() in any component to get the current theme's colour map.
 */
import React, { createContext, useContext } from 'react';
import { THEMES } from '../hooks/useTheme';

const ThemeContext = createContext(null);
const DisplaySafetyContext = createContext({ tacticalMode: false, onExitTactical: () => {} });

/**
 * ThemeProvider — place at the top of the component tree.
 * @param {object} colors — the `colors` object from a THEMES entry
 */
export function ThemeProvider({ colors, tacticalMode = false, onExitTactical = () => {}, children }) {
  return <ThemeContext.Provider value={colors}><DisplaySafetyContext.Provider value={{ tacticalMode, onExitTactical }}>{children}</DisplaySafetyContext.Provider></ThemeContext.Provider>;
}

export function useDisplaySafety() { return useContext(DisplaySafetyContext); }
export const DisplaySafetyProvider = DisplaySafetyContext.Provider;

/**
 * useColors — returns the active theme's colour map.
 * Falls back to the Standard palette when called outside a provider.
 */
export function useColors() {
  const colors = useContext(ThemeContext);
  return colors ?? THEMES.standard.colors;
}
