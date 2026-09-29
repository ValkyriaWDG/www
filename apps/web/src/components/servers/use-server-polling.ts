'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameRoute } from '@/modules/games/registry';
import type { ServerBrowserData } from '@/modules/integrations/servers/browser';
import { ageServerBrowserData } from '@/modules/integrations/servers/view';

/** Polls only our allowlisted read route; no overlapping requests or hidden-tab polling. */
export function useServerPolling(game: GameRoute, selected: string | null, initialData: ServerBrowserData) {
  const [data, setData] = useState(initialData);
  const [clock, setClock] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [coolingDown, setCoolingDown] = useState(true);
  const refreshRef = useRef<() => void>(() => undefined);
  const lastAttempt = useRef(0);
  const interval = Math.max(30, data.livePlayers?.refreshAfterSeconds ?? 30);
  const configured = data.overview.state !== 'not_configured';
  useEffect(() => {
    let active = true;
    // Keep throttling across toggles and response-driven interval changes.
    if (lastAttempt.current === 0) lastAttempt.current = Date.now();
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (!active || !configured || controller || document.visibilityState === 'hidden' || Date.now() - lastAttempt.current < 30_000) return;
      lastAttempt.current = Date.now();
      setCoolingDown(true);
      if (!navigator.onLine) { setFailed(true); setClock(Date.now()); return; }
      controller = new AbortController();
      const current = controller;
      const timeout = window.setTimeout(() => current.abort(), 10_000);
      setRefreshing(true);
      try {
        const suffix = selected ? `?server=${encodeURIComponent(selected)}` : '';
        const response = await fetch(`/api/servers/${game}${suffix}`, { signal: current.signal, cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('Server data unavailable');
        const next = await response.json() as ServerBrowserData;
        if (active) { setData(next); setFailed(false); setClock(Date.now()); }
      } catch {
        if (active) { setFailed(true); setClock(Date.now()); }
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        if (active) setRefreshing(false);
      }
    };
    refreshRef.current = () => { void refresh(); };
    const tick = () => {
      setClock(Date.now());
      setCoolingDown(Date.now() - lastAttempt.current < 30_000);
      if (automatic && Date.now() - lastAttempt.current >= interval * 1000) void refresh();
    };
    const visibility = () => { if (document.visibilityState === 'visible') tick(); };
    const online = () => { if (automatic) tick(); };
    const offline = () => { setFailed(true); setClock(Date.now()); };
    const timer = window.setInterval(tick, 5000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [game, selected, automatic, interval, configured]);
  // Exact SSR snapshot for hydration; subsequent ticks age it even after failures or while paused.
  return { data: clock === null ? data : ageServerBrowserData(data, new Date(clock), failed), failed, refreshing, coolingDown, automatic, setAutomatic, interval, refresh: () => refreshRef.current() };
}
