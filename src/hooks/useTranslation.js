/**
 * useTranslation — Thin wrapper around react-i18next's useTranslation.
 * Follows the same pattern as useColors() in ThemeContext.js.
 * Returns { t, i18n } for use in any component.
 */
import { useTranslation as useI18nTranslation } from 'react-i18next';

export function useTranslation() {
  const { t, i18n } = useI18nTranslation();
  return { t, i18n };
}
