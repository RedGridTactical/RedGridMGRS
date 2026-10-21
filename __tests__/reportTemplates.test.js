import { getMedevacFields, validMedevacContext, hasReportContent, formatReportTimestamp, buildReportText, MEDEVAC_REFERENCE, ICS201_REFERENCE } from '../src/utils/reportTemplates';
import en from '../src/i18n/en';

const t = key => key.split('.').reduce((value, part) => value?.[part], en) ?? key;
const locales = ['en','fr','de','es','it','pt-BR','nl','ru','pl','tr','ja','ko','zh-Hans','zh-Hant','ar-SA','hi'];
test.each(locales)('%s report references preserve placeholders and transmitted letter codes', locale => {
  const strings = require(`../src/i18n/${locale}.js`).default.reportCorrections;
  expect(Object.keys(strings).sort()).toEqual(Object.keys(en.reportCorrections).sort());
  for (const [key, value] of Object.entries(en.reportCorrections)) {
    expect(strings[key].trim().length).toBeGreaterThan(0);
    expect((strings[key].match(/\{\{\w+\}\}/g) || []).sort()).toEqual((value.match(/\{\{\w+\}\}/g) || []).sort());
  }
  const codes = key => [...strings[key].matchAll(/([A-Z])\s*=/g)].map(match => match[1]);
  expect(codes('line3Hint')).toEqual(['A','B','C','D','E']);
  expect(codes('line4Hint')).toEqual(['A','B','C','D']);
  expect(codes('line6WarHint')).toEqual(['N','P','E','X']);
  expect(codes('line7Hint')).toEqual(['A','B','C','D','E']);
  expect(codes('line8Hint')).toEqual(['A','B','C','D','E']);
  expect(codes('line9WarHint')).toEqual(['C','B','R','N']);
  expect([...strings.line5Hint.matchAll(/([LA])\s*\+/g)].map(match => match[1])).toEqual(['L','A']);
});
// Independent expectations transcribed from Army ATP4-02.2,2019-07-12,
// TableC-1 ppC-1–C-3. In particular Line5 uses L/A, not A/B.
test('medical reference guidance matches the dated primary-source code table', () => {
  expect(t('reportCorrections.line3Hint')).toBe('A=Urgent; B=Urgent-surgical; C=Priority; D=Routine; E=Convenience');
  expect(t('reportCorrections.line4Hint')).toBe('A=None; B=Hoist; C=Extraction equipment; D=Ventilator');
  expect(t('reportCorrections.line5Hint')).toBe('L + count = litter; A + count = ambulatory');
  expect(t('reportCorrections.line8Hint')).toBe('A=US military; B=US citizen; C=Non-US military; D=Non-US citizen; E=Enemy prisoner of war');
  expect(t('reportCorrections.line9WarHint')).toBe('C=Chemical; B=Biological; R=Radiological; N=Nuclear');
  expect(MEDEVAC_REFERENCE).toContain('2019-07-12');
});

test('the two nine-line contexts keep independent sixth/ninth-line values', () => {
  const peace = getMedevacFields('peacetime');
  const war = getMedevacFields('wartime');
  expect(peace).toHaveLength(9); expect(war).toHaveLength(9);
  expect(peace.map(f => f.key)).toEqual(['grid','callsign','patients','equip','num','injuryDetails','marking','nation','terrain']);
  expect(war.map(f => f.key)).toEqual(['grid','callsign','patients','equip','num','security','marking','nation','cbrn']);
  const values = { security: 'OLD SECURITY', cbrn: 'OLD CONTAMINATION', injuryDetails: 'Training injury description', terrain: 'Training terrain description' };
  const text = buildReportText({title:'9-LINE',fields:peace,values,context:'peacetime',t});
  expect(text).toContain('Training injury description'); expect(text).toContain('Training terrain description');
  expect(text).not.toContain('OLD SECURITY'); expect(text).not.toContain('OLD CONTAMINATION');
});

test.each([null,undefined,'','civilian','WAR','__proto__'])('unknown context %p cannot silently choose a variant', context => {
  expect(validMedevacContext(context)).toBe(false);
  expect(getMedevacFields(context)).toHaveLength(7);
  expect(getMedevacFields(context).some(f => ['security','cbrn','injuryDetails','terrain'].includes(f.key))).toBe(false);
});

test('hidden context values and whitespace do not turn a blank report into content', () => {
  const fields = getMedevacFields('peacetime');
  expect(hasReportContent(fields,{ security:'hidden',grid:'  \n' })).toBe(false);
  expect(hasReportContent(fields,{ grid:'0' })).toBe(true);
});

test('UTC insertion is explicit and local insertion carries its actual signed offset', () => {
  const timestamp = Date.UTC(2026,9,17,11,5);
  expect(formatReportTimestamp(timestamp)).toBe('171105Z OCT 2026');
  const local = formatReportTimestamp(timestamp,'local');
  expect(local).toMatch(/^2026-10-17 \d{2}:05 [+-]\d{2}:\d{2}$/);
  // Parsing the local value with its offset must recover the very same instant.
  expect(Date.parse(local.replace(' ','T').replace(/ ([+-])/,'$1'))).toBe(timestamp);
  expect(formatReportTimestamp(NaN)).toBeNull();
  expect(formatReportTimestamp(Infinity,'local')).toBeNull();
});

test('export keeps scope, source, time basis and explicit unentered fields', () => {
  const text = buildReportText({ title:t('reportCorrections.adaptedTitle'), fields:[{key:'incident',label:'INCIDENT'},{key:'time',label:'TIME'}], values:{incident:' TRAINING ONLY '}, scope:t('reportCorrections.icsScope'), reference:ICS201_REFERENCE,timeBasis:'local',t });
  expect(text).toContain('DRAFT / REFERENCE WORKSHEET');
  expect(text).toContain('ICS 201 — ADAPTED SUMMARY');
  expect(text).toContain('does not contain every official form block');
  expect(text).toContain('FEMA ICS 201 · v3 · adapted summary');
  expect(text).toContain('LOCAL TIME WITH UTC OFFSET');
  expect(text).toContain('INCIDENT: TRAINING ONLY');
  expect(text).toContain('TIME: NOT ENTERED');
});
