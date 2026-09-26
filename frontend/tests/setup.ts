import '@testing-library/jest-dom/vitest';

// --------------------------------------------------------------------------
// localStorage / sessionStorage polyfill
// jsdom ships a Storage stub but some vitest + jsdom version combinations
// expose it only via `window.localStorage`, not as a bare `localStorage`
// global.  Adding a concrete in-memory implementation on `globalThis` fixes
// "Cannot read properties of undefined (reading 'clear')" in tests that call
// `localStorage.clear()` / `localStorage.getItem()` directly.
// --------------------------------------------------------------------------
function makeStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeStorageMock(),
    writable: true,
  });
}
if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: makeStorageMock(),
    writable: true,
  });
}
