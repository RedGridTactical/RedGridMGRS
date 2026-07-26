/**
 * scopeIntegrity.test.js — static guard against out-of-scope identifier references.
 *
 * WHY THIS EXISTS
 * On 2026-07-26 the app shipped a boot-blocking crash: `showTeamRoster`,
 * `setShowTeamRoster` and `team` were declared in `App()` but consumed in
 * `AppContent()` without being threaded through props. Hermes threw
 * "Property 'showTeamRoster' doesn't exist" on first render, the error
 * boundary caught it, and users saw RED GRID ERROR instead of the app.
 *
 * None of the other tests caught it because they are pure-logic tests that
 * never mount a component. A full render harness would mean adopting
 * jest-expo plus mocks for every native module, which is a large, brittle
 * change. This does the precise job instead: it resolves every identifier
 * reference against its real lexical scope chain (via Babel's scope
 * analysis) and fails on anything unresolved.
 *
 * WHAT THIS COVERS: undefined / out-of-scope identifiers anywhere in the app
 * source — the exact class of bug above, in any file, not just App.js.
 * WHAT IT DOES NOT COVER: runtime failures where the identifier exists but
 * the value is wrong (null dereference, bad prop shape, bad hook order).
 * Those still need a device or a render harness.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverseModule = require('@babel/traverse');

const traverse = traverseModule.default || traverseModule;
const ROOT = path.join(__dirname, '..');

/** Identifiers that legitimately resolve at runtime without a local binding. */
const ALLOWED_GLOBALS = new Set([
  // JS standard library
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
  'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
  'Intl', 'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Uint16Array',
  'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array',
  'DataView', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'escape', 'unescape',
  'NaN', 'Infinity', 'undefined', 'globalThis', 'Function',
  // Timers / microtasks
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'setImmediate', 'clearImmediate', 'requestAnimationFrame',
  'cancelAnimationFrame', 'queueMicrotask',
  // Module / runtime
  'require', 'module', 'exports', 'process', 'global', '__DEV__', '__dirname',
  'console',
  // Browser/RN-ish surfaces used by libraries
  'fetch', 'Headers', 'Request', 'Response', 'AbortController', 'URL',
  'URLSearchParams', 'TextEncoder', 'TextDecoder', 'atob', 'btoa',
  'performance', 'navigator', 'window', 'document', 'Blob', 'FileReader',
  'XMLHttpRequest', 'WebSocket', 'FormData', 'Event', 'CustomEvent',
  // Jest (test files)
  'jest', 'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach',
  'beforeAll', 'afterAll',
]);

/** Recursively collect .js source files, skipping build output and deps. */
function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'build', 'dist', 'android', 'ios', 'coverage', 'assets'].includes(entry.name)) continue;
      collectSourceFiles(full, acc);
    } else if (entry.name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Return every identifier referenced in `code` that has no binding in its
 * lexical scope chain — i.e. what Hermes would throw on at runtime.
 */
function findUnresolvedReferences(code, filename) {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
    errorRecovery: false,
  });

  const unresolved = [];
  traverse(ast, {
    Program(programPath) {
      // Babel resolves references during traversal; `scope.globals` is every
      // reference with no binding anywhere up the chain.
      const globals = programPath.scope.globals || {};
      for (const [name, node] of Object.entries(globals)) {
        if (ALLOWED_GLOBALS.has(name)) continue;
        unresolved.push({
          name,
          line: node && node.loc ? node.loc.start.line : null,
          file: path.relative(ROOT, filename),
        });
      }
    },
  });
  return unresolved;
}

describe('scope integrity (no out-of-scope identifiers)', () => {
  const files = [
    path.join(ROOT, 'App.js'),
    ...collectSourceFiles(path.join(ROOT, 'src')),
  ].filter((f) => fs.existsSync(f));

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('App.js has no unresolved identifier references', () => {
    const code = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
    const bad = findUnresolvedReferences(code, path.join(ROOT, 'App.js'));
    if (bad.length) {
      const detail = bad.map((b) => `  ${b.file}:${b.line} -> '${b.name}'`).join('\n');
      throw new Error(
        `App.js references ${bad.length} identifier(s) with no binding in scope.\n` +
        `This is the crash class that shipped as "Property 'showTeamRoster' doesn't exist".\n` +
        `Usually it means state declared in one component is used in another ` +
        `without being passed as a prop.\n${detail}`
      );
    }
    expect(bad).toEqual([]);
  });

  it('every app source file has no unresolved identifier references', () => {
    const failures = [];
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      failures.push(...findUnresolvedReferences(code, file));
    }
    if (failures.length) {
      const detail = failures.map((b) => `  ${b.file}:${b.line} -> '${b.name}'`).join('\n');
      throw new Error(`${failures.length} unresolved identifier reference(s):\n${detail}`);
    }
    expect(failures).toEqual([]);
  });
});
