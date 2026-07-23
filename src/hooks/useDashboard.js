/**
 * useDashboard — dashboard data lifecycle (§8, §9, §12).
 *
 * Loads the full aggregated payload for the current global filters, and layers
 * a lightweight realtime poll on top (overview counts + HUD globe items +
 * alerts) so the command center stays live without re-fetching every heavy
 * analytic. This mirrors the backend's "realtime vs cached" split (§9): the
 * heavy analytics refresh on filter change, the realtime slice on an interval.
 *
 * Everything is driven exclusively by the confirmed dataset (§3.1) — the client
 * never aggregates local drafts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardOverview, dashboardRealtime, dashboardFilters, dashboardStatus } from '../services/BackendApiClient.js';

const REALTIME_MS = 15000;

export function useDashboard(filters) {
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [status, setStatus] = useState(null); // { persistenceEnabled }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadFull = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await dashboardOverview(filtersRef.current);
      if (!signal?.aborted) { setData(payload); setLastSync(new Date()); }
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // Static-ish: filter options + persistence status (once).
  useEffect(() => {
    let mounted = true;
    Promise.allSettled([dashboardFilters(), dashboardStatus()]).then(([f, s]) => {
      if (!mounted) return;
      if (f.status === 'fulfilled') setOptions(f.value);
      if (s.status === 'fulfilled') setStatus(s.value);
    });
    return () => { mounted = false; };
  }, []);

  // Full reload whenever the serialized filters change.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    const ctrl = new AbortController();
    loadFull(ctrl);
    return () => ctrl.abort();
  }, [filterKey, loadFull]);

  // Realtime poll: patch overview + map + alerts in place.
  useEffect(() => {
    let mounted = true;
    let timer;
    const tick = async () => {
      try {
        const slice = await dashboardRealtime(filtersRef.current);
        if (!mounted) return;
        setData((prev) => (prev ? { ...prev, overview: slice.overview, map: slice.map, alerts: slice.alerts } : prev));
        setLastSync(new Date());
      } catch { /* keep last good data on transient errors */ }
      if (mounted) timer = setTimeout(tick, REALTIME_MS);
    };
    timer = setTimeout(tick, REALTIME_MS);
    return () => { mounted = false; clearTimeout(timer); };
  }, [filterKey]);

  return { data, options, status, loading, error, lastSync, reload: () => loadFull() };
}
