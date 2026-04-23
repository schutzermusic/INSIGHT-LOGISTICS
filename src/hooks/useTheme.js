import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'insight.theme';
const MODES = ['light', 'dark', 'system'];

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredMode() {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (MODES.includes(raw)) return raw;
  } catch {
    // ignore: private mode, disabled storage, etc.
  }
  return 'system';
}

function resolveTheme(mode) {
  return mode === 'system' ? getSystemTheme() : mode;
}

function applyTheme(resolved) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
  root.setAttribute('data-theme', resolved);
}

// ──────────────────────────────────────────────────────────────
// Tiny observable store. We use useSyncExternalStore so the
// theme state is consistent across remounts and doesn't race
// with the inline pre-hydration script.
// ──────────────────────────────────────────────────────────────
const listeners = new Set();
let state = {
  mode: readStoredMode(),       // 'light' | 'dark' | 'system'
  resolved: null,               // 'light' | 'dark'
};
state.resolved = resolveTheme(state.mode);

function emit() {
  for (const l of listeners) l();
}

function setMode(next) {
  if (!MODES.includes(next)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage can be blocked — the in-memory state still updates
  }
  const resolved = resolveTheme(next);
  state = { mode: next, resolved };
  applyTheme(resolved);
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

// Server snapshot — keep client-only by returning the initial state.
function getServerSnapshot() {
  return state;
}

// Watch the system preference while mode === 'system'
if (typeof window !== 'undefined' && window.matchMedia) {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (state.mode === 'system') {
      const resolved = resolveTheme('system');
      if (resolved !== state.resolved) {
        state = { ...state, resolved };
        applyTheme(resolved);
        emit();
      }
    }
  };
  if (mql.addEventListener) mql.addEventListener('change', onChange);
  else if (mql.addListener) mql.addListener(onChange);
}

// Cross-tab sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = MODES.includes(e.newValue) ? e.newValue : 'system';
    if (next !== state.mode) {
      const resolved = resolveTheme(next);
      state = { mode: next, resolved };
      applyTheme(resolved);
      emit();
    }
  });
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // First mount: ensure the DOM matches the store. The inline script
  // in index.html runs before React, so normally this is a no-op — it
  // only corrects a mismatch (e.g. when localStorage changes happened
  // while the page was cached).
  useEffect(() => {
    applyTheme(snapshot.resolved);
  }, [snapshot.resolved]);

  const setTheme = useCallback((next) => setMode(next), []);
  const toggle = useCallback(() => {
    // Toggle only flips between the two explicit modes.
    setMode(snapshot.resolved === 'dark' ? 'light' : 'dark');
  }, [snapshot.resolved]);

  return {
    mode: snapshot.mode,          // user preference: 'light' | 'dark' | 'system'
    theme: snapshot.resolved,     // effective theme: 'light' | 'dark'
    isDark: snapshot.resolved === 'dark',
    setTheme,
    toggle,
  };
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
