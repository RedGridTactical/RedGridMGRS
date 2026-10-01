import { useEffect, useRef } from 'react';
import { tapHeavy, tapMedium } from '../utils/haptics';
import { observeGridCrossing } from '../utils/gridCrossing';
import { isFreshPosition } from '../utils/position';

export function useGridCrossing(mgrs, enabled, position) {
  const previous = useRef(null);
  useEffect(() => {
    if (!enabled || !isFreshPosition(position)) { previous.current = null; return; }
    const result = observeGridCrossing(previous.current, mgrs, position);
    previous.current = result.state;
    if (result.alert === 'major') tapHeavy();
    else if (result.alert === 'minor') tapMedium();
  }, [mgrs, enabled, position]);
}
