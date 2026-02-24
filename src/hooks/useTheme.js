/**
 * useTheme — Provides the active colour palette.
 * Free users: red (default only).
 * Pro users: red, green (NVG), white (day), blue (blue-force).
 */
import { useMemo } from 'react';

export const THEMES = {
  red: {
    id: 'red',
    label: 'RED LIGHT',
    sub: 'Default tactical display',
    pro: false,
    colors: {
      bg:    '#0A0000',
      text:  '#CC0000',
      text2: '#990000',
      text3: '#660000',
      text4: '#330000',
      text5: '#1A0000',
      accent:'#CC0000',
    },
  },
  green: {
    id: 'green',
    label: 'NVG GREEN',
    sub: 'Night vision goggle compatible',
    pro: true,
    colors: {
      bg:    '#001400',
      text:  '#00CC00',
      text2: '#009900',
      text3: '#006600',
      text4: '#003300',
      text5: '#001A00',
      accent:'#00CC00',
    },
  },
  white: {
    id: 'white',
    label: 'DAY WHITE',
    sub: 'High visibility in sunlight',
    pro: true,
    colors: {
      bg:    '#F5F5F5',
      text:  '#111111',
      text2: '#333333',
      text3: '#666666',
      text4: '#AAAAAA',
      text5: '#DDDDDD',
      accent:'#CC0000',
    },
  },
  blue: {
    id: 'blue',
    label: 'BLUE FORCE',
    sub: 'Blue-force tracker color scheme',
    pro: true,
    colors: {
      bg:    '#000A14',
      text:  '#0088CC',
      text2: '#006699',
      text3: '#004466',
      text4: '#002233',
      text5: '#00111A',
      accent:'#0088CC',
    },
  },
};

export function useTheme(themeId = 'red') {
  return useMemo(() => THEMES[themeId] ?? THEMES.red, [themeId]);
}
