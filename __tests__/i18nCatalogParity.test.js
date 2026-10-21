const fs = require('fs');
const path = require('path');
const { parseSync } = require('@babel/core');
const i18next = require('i18next');

const LOCALES = ['da', 'hr', 'id', 'nb', 'sk', 'sv', 'th', 'vi'];
const DIRECTORY = path.join(__dirname, '..', 'src', 'i18n');
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
// Danish uses `one` for fractions below 2 (including 0.5); Norwegian and
// Swedish do not. Exercise the actual locale rule instead of count === 1.
const COUNT_SAMPLES = [0, 1, 2, 3, 4, 5, 11, 21, 101, 0.1, 0.5, 1.1, 1.5, 2.1];

// Read literal data rather than importing a catalog: a spread of English would
// otherwise conceal missing translations, and duplicate object keys disappear
// after evaluation. Catalogs are bundled data, never executable loaders.
function readCatalog(locale) {
  const source = fs.readFileSync(path.join(DIRECTORY, `${locale}.js`), 'utf8');
  const ast = parseSync(source, { babelrc: false, configFile: false, sourceType: 'module' });
  const statements = ast.program.body.filter((node) => node.type !== 'EmptyStatement');
  if (statements.length !== 1 || statements[0].type !== 'ExportDefaultDeclaration') {
    throw new Error(`${locale}: use a standalone literal export; no imports or fallback composition`);
  }
  const flat = {};
  function visit(node, prefix) {
    if (node.type !== 'ObjectExpression') throw new Error(`${locale}:${prefix}: expected a literal object`);
    const seen = new Set();
    for (const property of node.properties) {
      if (property.type !== 'ObjectProperty' || property.computed || property.shorthand) {
        throw new Error(`${locale}:${prefix}: spreads and executable properties are not catalog data`);
      }
      const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
      if (typeof key !== 'string' || seen.has(key)) {
        throw new Error(`${locale}:${prefix}: invalid or duplicate key ${String(key)}`);
      }
      seen.add(key);
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (property.value.type === 'ObjectExpression') visit(property.value, fullKey);
      else if (property.value.type === 'StringLiteral') flat[fullKey] = property.value.value;
      else throw new Error(`${locale}:${fullKey}: expected a string`);
    }
  }
  visit(statements[0].declaration, '');
  return flat;
}

function interpolations(value) {
  return [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
    .map((match) => match[1].trim())
    .sort();
}

function malformedInterpolation(value) {
  return /\{\{|\}\}/.test(value.replace(/\{\{\s*[^{}]+?\s*\}\}/g, ''));
}

function literalEscapes(value) {
  return (value.match(/\\[nr]/g) || []).sort();
}

function requiredMachineTokens(value) {
  // These are input syntax, file formats, protocols and reference identifiers,
  // not prose, translated unit names, acronyms generally, or product claims.
  return [...new Set(value.match(
    /(?:https?:\/\/|redgrid:\/\/)[^\s<>"']+|YYYY-MM-DD|HH:mm|\b(?:MGRS|UTM|WGS\s*84|ICS\s+(?:201|214)|SPOTREP\s+S055|MBTiles|GPX|KML|JSON|PDF)\b/g,
  ) || [])];
}

function variablesFor(value, count = 2) {
  return Object.fromEntries(interpolations(value).map((token) => {
    const variable = token.replace(/^-\s*/, '').split(',')[0].trim();
    return [variable, variable === 'count' ? count : `value-${variable}`];
  }));
}

const english = readCatalog('en');
const baseKeys = Object.keys(english).sort();
const countKeys = baseKeys.filter((key) => interpolations(english[key]).includes('count'));

describe.each(LOCALES)('%s bundled translation coverage', (locale) => {
  let catalog;
  let instance;

  beforeAll(async () => {
    catalog = readCatalog(locale);
    instance = i18next.createInstance();
    await instance.init({
      lng: locale,
      fallbackLng: false,
      showSupportNotice: false,
      interpolation: { escapeValue: false },
      resources: { [locale]: { translation: catalog } },
    });
  });

  test('contains every English base key and only valid additional plural forms', () => {
    const categories = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
    // i18next supports an explicit zero override even when CLDR has no zero category.
    categories.add('zero');
    const missing = baseKeys.filter((key) => !Object.hasOwn(catalog, key));
    const unexpected = Object.keys(catalog).filter((key) => {
      if (Object.hasOwn(english, key)) return false;
      const suffix = key.match(PLURAL_SUFFIX);
      const base = key.replace(PLURAL_SUFFIX, '');
      return !suffix || !categories.has(suffix[1]) || !countKeys.includes(base);
    });
    expect({ missing, unexpected }).toEqual({ missing: [], unexpected: [] });
  });

  test('contains nonempty text without malformed interpolation or escaped line breaks', () => {
    const invalid = [];
    for (const [key, value] of Object.entries(catalog)) {
      const source = english[key] ?? english[key.replace(PLURAL_SUFFIX, '')];
      if (!value.trim()) invalid.push(`${key}: empty`);
      if (malformedInterpolation(value)) invalid.push(`${key}: malformed interpolation`);
      if (source && JSON.stringify(literalEscapes(value)) !== JSON.stringify(literalEscapes(source))) {
        invalid.push(`${key}: literal \\n/\\r instead of a line break`);
      }
      if (value.includes('\uFFFD')) invalid.push(`${key}: replacement character`);
    }
    expect(invalid).toEqual([]);
  });

  test('preserves each interpolation including repeated variables', () => {
    const mismatches = [];
    for (const [key, value] of Object.entries(catalog)) {
      const source = english[key] ?? english[key.replace(PLURAL_SUFFIX, '')];
      if (source && JSON.stringify(interpolations(value)) !== JSON.stringify(interpolations(source))) {
        mismatches.push({ key, expected: interpolations(source), actual: interpolations(value) });
      }
    }
    expect(mismatches).toEqual([]);
  });

  test('preserves input syntax, file formats, protocol URLs and reference identifiers', () => {
    const missing = [];
    for (const [key, value] of Object.entries(catalog)) {
      const source = english[key] ?? english[key.replace(PLURAL_SUFFIX, '')];
      if (!source) continue;
      for (const token of requiredMachineTokens(source)) {
        if (!value.includes(token)) missing.push(`${key}: ${token}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('resolves every base key locally without English fallback or raw placeholders', () => {
    const unresolved = [];
    for (const key of baseKeys) {
      const result = instance.t(key, { ...variablesFor(english[key]), returnDetails: true });
      if (result.usedLng !== locale || typeof result.res !== 'string' ||
          !result.res.trim() || /\{\{|\}\}/.test(result.res)) {
        unresolved.push({ key, language: result.usedLng, text: result.res });
      }
    }
    expect(unresolved).toEqual([]);
  });

  test('uses the locale plural category for count-bearing strings when variants exist', () => {
    const failures = [];
    const rules = new Intl.PluralRules(locale);
    for (const key of countKeys) {
      const variants = Object.keys(catalog).filter((candidate) =>
        PLURAL_SUFFIX.test(candidate) && candidate.replace(PLURAL_SUFFIX, '') === key);
      if (variants.length) {
        // A partially translated group can silently fall back to a generic form.
        for (const category of rules.resolvedOptions().pluralCategories) {
          if (!Object.hasOwn(catalog, `${key}_${category}`)) failures.push(`${key}: missing ${category}`);
        }
      }
      for (const count of COUNT_SAMPLES) {
        const category = count === 0 && Object.hasOwn(catalog, `${key}_zero`) ? 'zero' : rules.select(count);
        const expected = Object.hasOwn(catalog, `${key}_${category}`) ? `${key}_${category}` : key;
        const result = instance.t(key, { ...variablesFor(english[key], count), returnDetails: true });
        if (result.usedLng !== locale || result.exactUsedKey !== expected ||
            !result.res.includes(String(count)) || /\{\{|\}\}/.test(result.res)) {
          failures.push(`${key}(${count}): expected ${expected}, got ${result.exactUsedKey} (${result.usedLng})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
