// Loads the browser scripts into a sandbox with a tiny DOM stub, so the data logic can be tested in Node.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/core.js', 'js/ui.js', 'js/views.js', 'js/finance.js', 'js/weight.js', 'js/health.js', 'js/nutrition.js'];

export function loadApp() {
  const store = new Map();
  const el = () => ({ style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, addEventListener() {}, innerHTML: '', textContent: '' });
  const document = {
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], createElement: el,
    documentElement: el(), body: el(), visibilityState: 'visible',
  };
  const ctx = {
    console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, Promise, Error, SyntaxError, RegExp, Boolean,
    document, navigator: {}, location: { hash: '' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, innerWidth: 400,
    CustomEvent: class {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
  const HT = ctx.HT;
  HT.toast = () => {};
  HT.render = () => {};
  HT.load();
  HT.route = { name: 'test' };
  return { HT, store, ctx };
}
