/**
 * useWorkspaceLayout — window size, font scale, system insets, app chrome
 * and fold geometry in, one layout decision out. See adaptiveLayout.js.
 */
import { useMemo } from 'react';
import { I18nManager, useWindowDimensions } from 'react-native';
import { useSafeInsets } from './useSafeInsets';
import { resolveWorkspaceLayout } from '../utils/adaptiveLayout';
import { useFoldGeometry } from './useFoldGeometry';

/**
 * @param {object} options
 * @param {string} options.tab
 * @param {number} [options.bottomChrome] estimate used only until the frame is measured
 * @param {number} [options.topChrome] estimate used only until the frame is measured
 * @param {{x:number,y:number,width:number,height:number}|null} [options.frame] measured workspace frame in window dp
 * @param {boolean} [options.isPro] availability of Pro-only pane content (LISTS)
 */
export function useWorkspaceLayout({ tab, bottomChrome = 0, topChrome = 0, frame = null, isPro = false }) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeInsets();
  const foldingFeatures = useFoldGeometry();
  const isRTL = I18nManager.isRTL;
  const layout = useMemo(() => resolveWorkspaceLayout({
    width, height, fontScale, tab, bottomChrome, topChrome, foldingFeatures, isRTL, frame, isPro,
    insets: { top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right },
  }), [width, height, fontScale, tab, bottomChrome, topChrome, foldingFeatures, isRTL, frame, isPro, insets.top, insets.bottom, insets.left, insets.right]);
  return { layout, isRTL };
}
