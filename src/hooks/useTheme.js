/**
 * useTheme — Provides the active colour palette.
 * Standard and Tactical displays are available to everyone.
 * Pro palettes retain their existing identifiers and colors.
 *
 * Colour keys:
 *   text   — primary text / arrows / headings
 *   text2  — secondary text (labels, dim values)  [WCAG AA ~5:1]
 *   text3  — tertiary text (subtitles, hints)      [WCAG AA ~4.5:1]
 *   text4  — very dim text (footers, disabled)
 *   text5  — near-bg decorative (tiny separators)
 *   accent — interactive fill / brand accent
 *   accentText — legible accent for text and icons on the background
 *   actionText — foreground for filled accent controls
 *   bg     — screen background
 *   card   — card / modal surface
 *   card2  — input / field surface
 *   border — medium border
 *   border2— dim border / divider
 */
import { useMemo } from 'react';

export const THEMES = {
  standard: {
    id: 'standard',
    label: 'STANDARD',
    sub: 'Charcoal display with clear field data',
    pro: false,
    colors: {
      bg:      '#111518',
      text:    '#F2F0E8',
      text2:   '#AEB5B4',
      text3:   '#9BA5A5',
      text4:   '#788587',
      text5:   '#252D31',
      accent:  '#AA352D',
      accentText: '#E17B72',
      actionText: '#F2F0E8',
      card:    '#171C1F',
      card2:   '#1D2327',
      border:  '#566061',
      border2: '#30383C',
    },
  },
  red: {
    id: 'red',
    label: 'TACTICAL',
    sub: 'Red-on-black palette; use low screen brightness',
    pro: false,
    colors: {
      // Red-only RGB is a software palette, not a measured emission spectrum.
      // Keep active text legible; physical brightness controls light output.
      bg:      '#000000',
      text:    '#FF0000',
      text2:   '#EF0000',
      text3:   '#EF0000',
      text4:   '#A00000',
      text5:   '#110000',
      accent:  '#FF0000',
      accentText: '#FF0000',
      actionText: '#000000',
      card:    '#000000',
      card2:   '#000000',
      border:  '#700000',
      border2: '#220000',
    },
  },
  green: {
    id: 'green',
    label: 'FIELD GREEN',
    sub: 'Green-on-black palette',
    pro: true,
    colors: {
      bg:      '#000000',
      text:    '#00CC00',
      text2:   '#33BB33',
      text3:   '#22AA22',
      text4:   '#003300',
      text5:   '#001A00',
      accent:  '#00CC00',
      accentText: '#00CC00',
      actionText: '#000000',
      card:    '#000000',
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
      accentText: '#CC0000',
      actionText: '#FFFFFF',
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
      accentText: '#0099DD',
      actionText: '#000000',
      card:    '#000000',
      card2:   '#001422',
      border:  '#004466',
      border2: '#002233',
    },
  },
};

export function useTheme(themeId = 'standard') {
  return useMemo(() => Object.prototype.hasOwnProperty.call(THEMES, themeId) ? THEMES[themeId] : THEMES.standard, [themeId]);
}
