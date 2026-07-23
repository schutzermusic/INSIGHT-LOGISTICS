import { useCallback, useEffect, useSyncExternalStore } from 'react';

// Phase 4C — Motion preference system.
// User-level override of `prefers-reduced-motion` with three resolved modes:
//   • full    — all animations enabled
//   • reduced — opacity fades + shortened transitions, no large movement
//   • off     — no non-essential animation; UI state changes are instant
//
// Stored preference can also be 'system', which resolves to `reduced` when the
// OS reports `prefers-reduced-motion: reduce` and `full` otherwise.

const STORAGE_KEY = 'insight.motion';
const PREFERENCES = ['system', 'full', 'reduced', 'off'];
const RESOLVED_MODES = ['full', 'reduced', 'off'];

function systemPrefersReduced() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readStoredPreference() {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (PREFERENCES.includes(raw)) return raw;
  } catch {
    // private mode / storage disabled — fall through
  }
  return 'system';
}

function resolvePreference(preference) {
  if (preference === 'system') return systemPrefersReduced() ? 'reduced' : 'full';
  return preference;
}

function applyMode(resolved) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-motion', resolved);
}

// ──────────────────────────────────────────────────────────────
// Tiny observable store (same shape as useTheme). useSyncExternalStore
// keeps the resolved mode consistent across remounts and in sync with
// the inline pre-hydration script in index.html.
// ──────────────────────────────────────────────────────────────
const listeners = new Set();
let state = {
  preference: readStoredPreference(),  // 'system' | 'full' | 'reduced' | 'off'
  mode: null,                          // 'full' | 'reduced' | 'off'
};
state.mode = resolvePreference(state.preference);

function emit() {
  for (const l of listeners) l();
}

function setPreference(next) {
  if (!PREFERENCES.includes(next)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage blocked — in-memory state still updates
  }
  const mode = resolvePreference(next);
  state = { preference: next, mode };
  applyMode(mode);
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return state;
}

// Watch the OS-level preference while preference === 'system'
if (typeof window !== 'undefined' && window.matchMedia) {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => {
    if (state.preference === 'system') {
      const mode = resolvePreference('system');
      if (mode !== state.mode) {
        state = { ...state, mode };
        applyMode(mode);
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
    const next = PREFERENCES.includes(e.newValue) ? e.newValue : 'system';
    if (next !== state.preference) {
      const mode = resolvePreference(next);
      state = { preference: next, mode };
      applyMode(mode);
      emit();
    }
  });
}

export function useMotionPreference() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Correct any mismatch with the DOM after mount. The inline script in
  // index.html should have already done this work pre-paint, so this is
  // a no-op in the common case.
  useEffect(() => {
    applyMode(snapshot.mode);
  }, [snapshot.mode]);

  const setPref = useCallback((next) => setPreference(next), []);

  const cycle = useCallback(() => {
    // UI convenience: cycle system → full → reduced → off → system
    const order = ['system', 'full', 'reduced', 'off'];
    const idx = order.indexOf(state.preference);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % order.length;
    setPreference(order[nextIdx]);
  }, []);

  return {
    preference: snapshot.preference,  // user's stored choice
    mode: snapshot.mode,              // resolved: 'full' | 'reduced' | 'off'
    reduced: snapshot.mode !== 'full',
    off: snapshot.mode === 'off',
    setPreference: setPref,
    cycle,
  };
}

// Convenience: drop-in replacement for framer-motion's useReducedMotion()
// that also honors the user override.
export function useReducedMotionMode() {
  return useMotionPreference().reduced;
}

export { STORAGE_KEY as MOTION_STORAGE_KEY, PREFERENCES, RESOLVED_MODES };
