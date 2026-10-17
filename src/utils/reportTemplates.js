// Army ATP4-02.2,12 July2019, AppendixC, TableC-1 (ppC-1–C-3).
// Reference identity is explicit; current agency/unit procedures govern its use.
export const MEDEVAC_REFERENCE = 'ATP 4-02.2 · 2019-07-12 · Table C-1';
export const ICS201_REFERENCE = 'FEMA ICS 201 · v3 · adapted summary';

const medevacField = (key, term, extra = {}) => ({
  key, labelKey: `reportCorrections.${term}`, hintKey: `reportCorrections.${term}Hint`, ...extra,
});
const COMMON_START = [
  medevacField('grid', 'line1', { autoFill: 'grid' }),
  medevacField('callsign', 'line2'),
  medevacField('patients', 'line3'),
  medevacField('equip', 'line4'),
  medevacField('num', 'line5'),
];
const COMMON_END = [medevacField('marking', 'line7'), medevacField('nation', 'line8')];

export function validMedevacContext(context) {
  return context === 'peacetime' || context === 'wartime';
}

// Context-specific keys prevent old security/contamination text being silently
// reinterpreted as injury/terrain descriptions when the user changes context.
export function getMedevacFields(context) {
  if (!validMedevacContext(context)) return [...COMMON_START, ...COMMON_END];
  const peace = context === 'peacetime';
  return [...COMMON_START,
    medevacField(peace ? 'injuryDetails' : 'security', peace ? 'line6Peace' : 'line6War'),
    ...COMMON_END,
    medevacField(peace ? 'terrain' : 'cbrn', peace ? 'line9Peace' : 'line9War'),
  ];
}

export function hasReportContent(fields, values = {}) {
  return fields.some(field => typeof values[field.key] === 'string' && values[field.key].trim().length > 0);
}

export function formatReportTimestamp(timestamp, basis = 'utc') {
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = value => String(value).padStart(2, '0');
  if (basis === 'local') {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  }
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}Z ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function buildReportText({ title, fields, values, scope, reference, context, timeBasis, t }) {
  const lines = [t('reportCorrections.draftLabel'), `=== ${title} ===`];
  if (scope) lines.push(scope);
  if (reference) lines.push(`${t('reportCorrections.referenceLabel')}: ${reference}`);
  if (context) lines.push(`${t('reportCorrections.contextLabel')}: ${t(`reportCorrections.${context}`)}`);
  if (timeBasis) lines.push(`${t('reportCorrections.timeBasisLabel')}: ${t(`reportCorrections.${timeBasis === 'local' ? 'localTime' : 'utcTime'}`)}`);
  return [...lines, ...fields.map(field => `${field.labelKey ? t(field.labelKey) : field.label}: ${values[field.key]?.trim() || t('reportCorrections.blank')}`)].join('\n');
}
