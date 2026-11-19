'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, Channel, Project, ProviderConfig } from '@/types';
import { onDBChange, type StoreName } from '@/services/storage/db';
import { getProject, listProjects, updateProject } from '@/services/storage/projects';
import { listChannels } from '@/services/storage/channels';
import { getSettings, listProviders, saveSettings } from '@/services/storage/settings';
import { assetUrl } from '@/services/storage/assets';
import { errorMessage } from '@/utils';

/** Loads data and reloads it whenever one of the given stores changes (any screen, any background job). */
export function useLive<T>(loader: () => Promise<T>, deps: unknown[], stores: StoreName[], key?: string) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reload = useCallback(() => {
    loaderRef
      .current()
      .then((d) => {
        setData(d);
        setError(undefined);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
    let raf = 0;
    const off = onDBChange((store, k) => {
      if (!stores.includes(store)) return;
      if (key && k && k !== key) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(reload);
    });
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);
  return { data, error, loading, reload };
}

export function useProject(id?: string | null) {
  const live = useLive(() => (id ? getProject(id) : Promise.resolve(undefined)), [id], ['projects'], id ?? undefined);
  const update = useCallback(
    async (fn: (p: Project) => Project | void) => {
      if (!id) return;
      await updateProject(id, fn);
    },
    [id],
  );
  return { project: live.data, loading: live.loading, error: live.error, update };
}

export function useProjects() {
  return useLive(listProjects, [], ['projects']);
}

export function useChannels() {
  return useLive<Channel[]>(listChannels, [], ['channels']);
}

export function useProviders() {
  return useLive<ProviderConfig[]>(listProviders, [], ['providers']);
}

export function useSettings() {
  const live = useLive<AppSettings>(getSettings, [], ['kv']);
  const save = useCallback((patch: Partial<AppSettings>) => saveSettings(patch), []);
  return { settings: live.data, save };
}

export function useAssetUrl(id?: string) {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    if (id) assetUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
