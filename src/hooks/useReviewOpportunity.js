import { useCallback, useEffect, useRef } from 'react';
import { AppState, Keyboard } from 'react-native';
import { isReviewPresentationIdle } from '../utils/reviewPresentation';

export const REVIEW_IDLE_MS = 5000;

/** One quiet post-task opportunity. Never retries later on launch, dismissal or resume. */
export function useReviewOpportunity({ requestReviewIfEligible, canQueue, isContextStable, contextKey }) {
  const current = useRef(null);
  current.current = { requestReviewIfEligible, canQueue, isContextStable, contextKey };
  const timer = useRef(null);
  const generation = useRef(0);
  const keyboardOpen = useRef(Keyboard.isVisible?.() === true);
  const mounted = useRef(true);
  const cancelReview = useCallback(() => {
    generation.current += 1;
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const queueReview = useCallback(() => {
    cancelReview();
    if (!mounted.current || AppState.currentState !== 'active' || !current.current.canQueue()) return false;
    const token = generation.current;
    const screen = current.current.contextKey;
    timer.current = setTimeout(() => {
      timer.current = null;
      const stable = () => mounted.current && token === generation.current
        && screen === current.current.contextKey && AppState.currentState === 'active'
        && !keyboardOpen.current && Keyboard.isVisible?.() !== true
        && current.current.canQueue() && current.current.isContextStable() && isReviewPresentationIdle();
      if (stable()) current.current.requestReviewIfEligible({ isContextStable: stable }).catch(() => {});
    }, REVIEW_IDLE_MS);
    return true;
  }, [cancelReview]);
  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener('change', state => { if (state !== 'active') cancelReview(); });
    const show = Keyboard.addListener('keyboardDidShow', () => { keyboardOpen.current = true; cancelReview(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardOpen.current = false; });
    return () => { mounted.current = false; cancelReview(); app.remove(); show.remove(); hide.remove(); };
  }, [cancelReview]);
  useEffect(() => { cancelReview(); }, [contextKey, cancelReview]);
  return { queueReview, cancelReview };
}
