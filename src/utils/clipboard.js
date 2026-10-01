/** Clipboard success is reported only after the native API confirms the write. */
export async function copyTextToClipboard(text) {
  if (typeof text !== 'string' || text.length === 0) throw new Error('COPY_EMPTY');
  let clipboard;
  try { clipboard = require('expo-clipboard'); } catch { throw new Error('COPY_UNAVAILABLE'); }
  if (typeof clipboard?.setStringAsync !== 'function') throw new Error('COPY_UNAVAILABLE');
  const written = await clipboard.setStringAsync(text);
  if (written !== true) throw new Error('COPY_FAILED');
  return true;
}
