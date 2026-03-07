/**
 * useTheme — Provides the active colour palette.
 * Free users: red (default only).
 * Pro users: red, green (NVG), white (day), blue (blue-force).
 *
 * Colour keys:
 *   text   — primary text / arrows / headings
 *   text2  — secondary text (labels, dim values)  [WCAG AA ~5:1]
 *   text3  — tertiary text (subtitles, hints)      [WCAG AA ~4.5:1]
 *   text4  — very dim text (footers, disabled)
 *   text5  — near-bg decorative (tiny separators)
 *   accent — interactive highlights (same as text usually)
 *   bg     — screen background
 *   card   — card / modal surface
 *   card2  — input / field surface
 *   border — medium border
 *   border2— dim border / divider
 */
import { useMemo } from 'react';

export const THEMES = {
  red: {
    id: 'red',
    label: 'RED LIGHT',
    sub: 'Default tactical display',
    pro: false,
    colors: {
      bg:      '#000000',
      text:    '#CC0000',
      text2:   '#BB3333',
      text3:   '#AA2222',
      text4:   '#330000',
      text5:   '#1A0000',
      accent:  '#CC0000',
      card:    '#0A0000',
      card2:   '#110000',
      border:  '#660000',
      border2: '#330000',
    },
  },
  green: {
    id: 'green',
    label: 'NVG GREEN',
    sub: 'Night vision goggle compatible',
    pro: true,
    colors: {
      bg:      '#000000',
      text:    '#00CC00',
      text2:   '#33BB33',
      text3:   '#22AA22',
      text4:   '#003300',
      text5:   '#001A00',
      accent:  '#00CC00',
      card:    '#001400',
      card2:   '#001E00',
      border:  '#006600',
      border2: '#003300',
    },
  },
  white: {
    id: 'white',
    label: 'DAY WHITE',
    sub: 'High visibility in sunlight',
    pro: true,
    colors: {
      bg:      '#F5F5F5',
      text:    '#111111',
      text2:   '#333333',
      text3:   '#555555',
      text4:   '#999999',
      text5:   '#DDDDDD',
      accent:  '#CC0000',
      card:    '#FFFFFF',
      card2:   '#EEEEEE',
      border:  '#999999',
      border2: '#CCCCCC',
    },
  },
  blue: {
    id: 'blue',
    label: 'BLUE FORCE',
    sub: 'Blue-force tracker color scheme',
    pro: true,
    colors: {
      bg:      '#000000',
      text:    '#0099DD',
      text2:   '#33AABB',
      text3:   '#2288AA',
      text4:   '#002233',
      text5:   '#00111A',
      accent:  '#0099DD',
      card:    '#000A14',
      card2:   '#001422',
      border:  '#004466',
      border2: '#002233',
    },
  },
};

export function useTheme(themeId = 'red') {
  return useMemo(() => THEMES[themeId] ?? THEMES.red, [themeId]);
}
