'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Cloud, Database, ExternalLink, KeyRound, Plug, Plus, Settings as Cog, Shield, Star, Trash2, Tv } from 'lucide-react';
import type { AppSettings, AssetKind, AssetMeta, ProviderConfig } from '@/types';
import { PROVIDER_CATALOG, adapterInfo } from '@/config/providers';
import {
  FORMAT_LABELS,
  PROVIDER_BILLING_LABELS,
  PROVIDER_KINDS,
  PROVIDER_KIND_LABELS,
  RENDER_ENGINES,
  RENDER_ENGINE_LABELS,
  RENDER_RESOLUTIONS,
  RESOLUTION_LABELS,
  VIDEO_FORMATS,
  VISUAL_STYLES,
  VISUAL_STYLE_LABELS,
  type ProviderKind,
} from '@/config/states';
import { AutoText, Badge, Button, Card, Field, InfoNote, Input, PageHeader, SectionTitle, Select, Sheet, Tabs, Toggle } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useLive, useProviders, useSettings } from '@/hooks/data';
import { serverStatus, testProviderConnection } from '@/services/ai/client';
import { clearPaidBudget } from '@/services/ai/approval';
import { deleteProvider, listUsage, saveProvider } from '@/services/storage/settings';
import { deleteAsset, listAssets } from '@/services/storage/assets';
import { collectAssetIds, listProjects } from '@/services/storage/projects';
import { requestPersistentStorage, storageEstimate } from '@/services/storage/db';
import { exportProjectBackup } from '@/services/export/zip';
import { testWorker } from '@/services/rendering/cloud';
import { downloadBlob, errorMessage, formatBytes, formatDate, slugify, uid } from '@/utils';

function SecretText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <Input type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />;
}

type Section = 'providers' | 'general' | 'rendering' | 'storage' | 'security';

function ProviderEditor({ value, onChange }: { value: ProviderConfig; onChange: (p: ProviderConfig) => void }) {
  const info = adapterInfo(value.type)!;
  const get = (key: string) => (key.startsWith('extra.') ? value.extra?.[key.slice(6)] ?? '' : ((value as unknown as Record<string, string | undefined>)[key] ?? ''));
  const set = (key: string, v: string) =>
    onChange(key.startsWith('extra.') ? { ...value, extra: { ...(value.extra ?? {}), [key.slice(6)]: v } } : { ...value, [key]: v || undefined });
  return (
    <div className="space-y-3">
      <Field label="Display name"><Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></Field>
      {info.fields.map((f) => (
        <Field key={f.key} label={f.label + (f.required ? ' *' : '')} hint={f.help ?? (f.key === 'apiKey' && info.envKey ? `Optional when ${info.envKey} is set on the server (recommended).` : undefined)}>
          <Input type={f.secret ? 'password' : 'text'} autoComplete="off" value={get(f.key)} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
        </Field>
      ))}
      <InfoNote>
        <b>{PROVIDER_BILLING_LABELS[info.billing]}.</b> {info.quotaNote}
      </InfoNote>
      <p className="text-sm text-muted">{info.notes}</p>
      {info.signupUrl && (
        <a href={info.signupUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
          Get an API key <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function Providers({ settings, save }: { settings: AppSettings; save: (p: Partial<AppSettings>) => Promise<void> }) {
  const { data: providers } = useProviders();
  const { data: usage } = useLive(listUsage, [], ['usage']);
  const { toast, confirm } = useFeedback();
  const [adding, setAdding] = useState<ProviderKind | null>(null);
  const [edit, setEdit] = useState<ProviderConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [quota, setQuota] = useState<Record<string, string>>({});
  const [env, setEnv] = useState<Record<string, boolean> | null>(null);
  const [envError, setEnvError] = useState<string | null>(null);
  useEffect(() => {
    serverStatus().then((s) => ('error' in s ? setEnvError(s.error) : setEnv(s.env)));
  }, [settings.appToken]);

  const preferredKey = (k: ProviderKind) => (k === 'text' ? 'preferredText' : k === 'image' ? 'preferredImage' : 'preferredVoice') as 'preferredText' | 'preferredImage' | 'preferredVoice';

  const test = async (p: ProviderConfig) => {
    setTesting(p.id);
    const r = await testProviderConnection(p);
    await saveProvider({ ...p, lastTest: { ok: r.ok, message: r.message, at: Date.now() } });
    if (r.quota) {
      const q = r.quota;
      setQuota((x) => ({ ...x, [p.id]: `${q.used ?? '?'} / ${q.limit ?? 'no limit'} ${q.unit}${q.resetsAt ? ` · resets ${formatDate(Date.parse(q.resetsAt))}` : ''}` }));
    }
    toast(r.message, r.ok ? 'success' : 'error');
    setTesting(null);
  };

  return (
    <div className="space-y-4">
      <InfoNote>
        Free generation is never unlimited: every free service has quotas and rate limits that can change. Paid providers always ask before sending anything, and the app never switches to a paid provider on its own.
      </InfoNote>
      <Card className="text-sm">
        <div className="mb-1 font-bold">Keys configured on the server</div>
        {envError ? (
          <div className="text-warning">{envError}</div>
        ) : env ? (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(env).filter(([k]) => k !== 'APP_ACCESS_TOKEN').map(([k, v]) => <Badge key={k} tone={v ? 'success' : 'neutral'}>{k}</Badge>)}
          </div>
        ) : (
          <div className="text-muted">Checking…</div>
        )}
        <p className="mt-2 text-xs text-muted">Server environment keys never reach the browser. Keys typed below are stored only on this device (IndexedDB) and sent over HTTPS to this app&apos;s own server for each request.</p>
      </Card>
      {!providers && <div className="skeleton h-48 rounded-2xl" />}
      {providers && PROVIDER_KINDS.map((kind) => {
        const list = (providers ?? []).filter((p) => p.kind === kind);
        return (
          <div key={kind}>
            <SectionTitle action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(kind)}>Add</Button>}>{PROVIDER_KIND_LABELS[kind]}</SectionTitle>
            {list.length === 0 && <Card className="text-sm text-muted">Not connected.</Card>}
            <div className="space-y-2">
              {list.map((p) => {
                const info = adapterInfo(p.type);
                const u = usage?.find((x) => x.providerId === p.id);
                const preferred = settings[preferredKey(kind)] === p.id;
                return (
                  <Card key={p.id} className="space-y-2 p-3">
                    <div className="flex items-start gap-2">
                      <div className={`mt-1.5 size-2.5 rounded-full ${!p.enabled ? 'bg-muted' : p.lastTest ? (p.lastTest.ok ? 'bg-success' : 'bg-danger') : 'bg-warning'}`} />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 font-bold">
                          {p.name}
                          {preferred && <Badge tone="accent"><Star className="size-3" /> Preferred</Badge>}
                          {info && <Badge tone={info.billing === 'paid' ? 'warning' : 'success'}>{PROVIDER_BILLING_LABELS[info.billing]}</Badge>}
                        </div>
                        <div className="text-xs text-muted">
                          {p.model || info?.defaultModel} · key: {p.apiKey ? 'on device' : info?.envKey && env?.[info.envKey] ? 'server' : info?.transport === 'direct' ? 'not needed' : 'missing'}
                          {u && ` · today ${u.requests} requests (${u.failures} failed)`}
                        </div>
                        {p.lastTest && <div className={`text-xs ${p.lastTest.ok ? 'text-success' : 'text-danger'}`}>{p.lastTest.message}</div>}
                        {quota[p.id] && <div className="text-xs text-accent-2">Provider-reported quota: {quota[p.id]}</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" loading={testing === p.id} icon={<Plug className="size-4" />} onClick={() => test(p)}>Test</Button>
                      <Button size="sm" onClick={() => setEdit(structuredClone(p))}>Configure</Button>
                      {!preferred && <Button size="sm" icon={<Star className="size-4" />} onClick={() => save({ [preferredKey(kind)]: p.id })}>Prefer</Button>}
                      <Toggle checked={p.enabled} onChange={(v) => saveProvider({ ...p, enabled: v })} label={p.enabled ? 'On' : 'Off'} />
                      <Button size="sm" variant="ghost" aria-label="Remove provider" onClick={async () => {
                        if (await confirm({ title: `Remove ${p.name}?`, body: 'Its key stored on this device is deleted.', confirm: 'Remove', danger: true })) {
                          await deleteProvider(p.id);
                          clearPaidBudget(p.id);
                        }
                      }}>
                        <Trash2 className="size-4 text-danger" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      <Sheet open={!!adding} onClose={() => setAdding(null)} title={`Add ${adding ? PROVIDER_KIND_LABELS[adding] : ''} provider`}>
        <div className="space-y-2">
          {PROVIDER_CATALOG.filter((c) => c.kind === adding).map((c) => (
            <button
              key={c.type}
              className="w-full rounded-2xl border border-line bg-surface-2 p-3 text-left hover:border-accent"
              onClick={() => {
                setAdding(null);
                setEdit({ id: uid('pv'), kind: c.kind, type: c.type, name: c.name, enabled: true, model: c.defaultModel, endpoint: c.defaultEndpoint });
              }}
            >
              <div className="flex flex-wrap items-center gap-2 font-bold">
                {c.name} <Badge tone={c.billing === 'paid' ? 'warning' : 'success'}>{PROVIDER_BILLING_LABELS[c.billing]}</Badge>
              </div>
              <div className="mt-0.5 text-xs text-muted">{c.notes}</div>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.name ?? ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!edit) return;
                const info = adapterInfo(edit.type)!;
                const missing = info.fields.filter((f) => f.required && !(f.key.startsWith('extra.') ? edit.extra?.[f.key.slice(6)] : (edit as unknown as Record<string, string | undefined>)[f.key]));
                if (missing.length) return toast(`Fill in: ${missing.map((f) => f.label).join(', ')}`, 'warning');
                await saveProvider(edit);
                const isFirst = !(providers ?? []).some((p) => p.kind === edit.kind && p.id !== edit.id);
                if (isFirst && info.billing !== 'paid') await save({ [preferredKey(edit.kind)]: edit.id });
                setEdit(null);
                void test(edit);
              }}
            >
              Save & test
            </Button>
          </>
        }
      >
        {edit && <ProviderEditor value={edit} onChange={setEdit} />}
      </Sheet>
    </div>
  );
}

function StorageSection() {
  const { toast, confirm } = useFeedback();
  const { data: assets, reload } = useLive(() => listAssets(), [], ['assets']);
  const { data: projects } = useLive(listProjects, [], ['projects']);
  const [est, setEst] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    storageEstimate().then(setEst);
  }, [assets?.length]);
  const byKind = useMemo(() => {
    const m = new Map<AssetKind, { n: number; size: number }>();
    for (const a of assets ?? []) {
      const x = m.get(a.kind) ?? { n: 0, size: 0 };
      x.n++;
      x.size += a.size;
      m.set(a.kind, x);
    }
    return [...m.entries()].sort((a, b) => b[1].size - a[1].size);
  }, [assets]);
  const used = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects ?? []) for (const id of collectAssetIds(p)) s.add(id);
    return s;
  }, [projects]);
  const orphans = (assets ?? []).filter((a) => a.projectId && !used.has(a.id) && !(projects ?? []).some((p) => p.id === a.projectId));
  const videos = (assets ?? []).filter((a) => a.kind === 'video');

  const removeList = async (list: AssetMeta[], what: string) => {
    if (!list.length) return;
    if (!(await confirm({ title: `Delete ${list.length} ${what}?`, body: `Frees ${formatBytes(list.reduce((a, b) => a + b.size, 0))}. This cannot be undone.`, confirm: 'Delete', danger: true }))) return;
    for (const a of list) await deleteAsset(a.id);
    toast('Deleted', 'success');
    reload();
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <div className="flex items-center gap-2 font-bold"><Database className="size-4 text-accent" /> Device storage</div>
        {est ? (
          <>
            <div className="text-sm">{formatBytes(est.usage)} used of {formatBytes(est.quota)} available to this app.</div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent" style={{ width: `${Math.min(100, (est.usage / Math.max(1, est.quota)) * 100)}%` }} /></div>
            <div className="text-xs text-muted">
              {est.persisted ? 'Persistent storage granted — the browser will not evict your projects.' : 'Not persistent: iOS may clear website data after weeks without use. Add the app to the Home Screen and export backups.'}
            </div>
            {!est.persisted && <Button size="sm" onClick={async () => setEst({ ...est, persisted: await requestPersistentStorage() })}>Request persistent storage</Button>}
          </>
        ) : (
          <div className="text-sm text-muted">Storage estimate not available in this browser.</div>
        )}
        <p className="text-xs text-muted">All projects and media live in this browser (IndexedDB). Nothing is uploaded except the prompts/text you send to AI providers and, if you use it, the cloud render worker. Media is never deleted automatically.</p>
      </Card>
      <Card>
        <div className="mb-2 font-bold">Media by type</div>
        <div className="space-y-1 text-sm">
          {byKind.map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><span>{v.n} · {formatBytes(v.size)}</span></div>
          ))}
          {!byKind.length && <div className="text-muted">No media yet.</div>}
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const zip = new JSZip();
              for (const p of projects ?? []) zip.file(`${slugify(p.title)}_${p.id}.creatorstudio.zip`, await exportProjectBackup(p));
              downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `creator-studio-backup-${new Date().toISOString().slice(0, 10)}.zip`);
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Back up all projects
        </Button>
        <Button variant="danger" disabled={!videos.length} onClick={() => removeList(videos, 'rendered videos')}>Delete rendered videos ({formatBytes(videos.reduce((a, b) => a + b.size, 0))})</Button>
        <Button variant="danger" disabled={!orphans.length} onClick={() => removeList(orphans, 'files of deleted projects')}>Delete leftovers of deleted projects ({orphans.length})</Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, save } = useSettings();
  const { toast } = useFeedback();
  const [section, setSection] = useState<Section>('providers');
  const [workerMsg, setWorkerMsg] = useState('');
  if (!settings) return <div className="skeleton h-40 rounded-2xl" />;
  const r = settings.defaultRender;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" icon={<Cog className="size-5" />} />
      <Tabs
        value={section}
        onChange={setSection}
        tabs={[
          { value: 'providers', label: 'AI providers' },
          { value: 'general', label: 'General' },
          { value: 'rendering', label: 'Rendering' },
          { value: 'storage', label: 'Storage & backup' },
          { value: 'security', label: 'Security' },
        ]}
      />
      {section === 'providers' && <Providers settings={settings} save={save} />}
      {section === 'general' && (
        <Card className="space-y-4">
          <Field label="Theme">
            <Select value={settings.theme} onChange={(v) => save({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
          </Field>
          <Field label="Interface language" hint="The interface is currently in English. Scripts, voice-over, subtitles and SEO use each project's own language (Turkish, Spanish, English…).">
            <Select value={settings.uiLanguage} onChange={(v) => save({ uiLanguage: v })} options={[{ value: 'en', label: 'English' }, { value: 'tr', label: 'Türkçe (interface not yet translated)' }, { value: 'es', label: 'Español (interface not yet translated)' }]} />
          </Field>
          <Field label="Default video language"><AutoText value={settings.defaultLanguage} onSave={(v) => save({ defaultLanguage: v })} /></Field>
          <Field label="Default video format"><Select value={settings.defaultFormat} onChange={(v) => save({ defaultFormat: v })} options={VIDEO_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))} /></Field>
          <Field label="Default image style"><Select value={settings.defaultVisualStyle} onChange={(v) => save({ defaultVisualStyle: v })} options={VISUAL_STYLES.map((s) => ({ value: s, label: VISUAL_STYLE_LABELS[s] }))} /></Field>
          <Field label="Parallel image generations" hint="1 protects iPhone memory and free quotas. Use 2–3 only with self-hosted or paid providers.">
            <Select value={String(settings.imageConcurrency) as '1' | '2' | '3'} onChange={(v) => save({ imageConcurrency: Number(v) })} options={[{ value: '1', label: '1 (recommended)' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
          </Field>
          <Link href="/channels" className="flex items-center gap-2 text-sm font-semibold text-accent"><Tv className="size-4" /> Channel management</Link>
        </Card>
      )}
      {section === 'rendering' && (
        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="font-bold">Default export for new projects</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Resolution"><Select value={r.resolution} onChange={(v) => save({ defaultRender: { ...r, resolution: v } })} options={RENDER_RESOLUTIONS.map((x) => ({ value: x, label: RESOLUTION_LABELS[x] }))} /></Field>
              <Field label="Engine"><Select value={r.engine} onChange={(v) => save({ defaultRender: { ...r, engine: v } })} options={RENDER_ENGINES.map((e) => ({ value: e, label: RENDER_ENGINE_LABELS[e].title }))} /></Field>
            </div>
          </Card>
          <Card className="space-y-3">
            <div className="flex items-center gap-2 font-bold"><Cloud className="size-4 text-accent" /> Cloud render worker</div>
            <p className="text-sm text-muted">For long videos, deploy the included render worker (native FFmpeg, Docker; see README) and connect it here. Assets are uploaded to your worker only when you render with it, and deleted from it after download.</p>
            <Field label="Worker URL"><AutoText value={settings.cloudWorkerUrl ?? ''} placeholder="https://creator-studio-render.fly.dev" onSave={(v) => save({ cloudWorkerUrl: v.trim() || undefined })} /></Field>
            <Field label="Worker token"><SecretText value={settings.cloudWorkerToken ?? ''} onSave={(v) => save({ cloudWorkerToken: v || undefined })} /></Field>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={!settings.cloudWorkerUrl} onClick={async () => {
                try {
                  setWorkerMsg(await testWorker({ url: settings.cloudWorkerUrl!, token: settings.cloudWorkerToken ?? '' }));
                } catch (e) {
                  setWorkerMsg(errorMessage(e));
                }
              }}>Test worker</Button>
              <span className="text-sm text-muted">{workerMsg}</span>
            </div>
          </Card>
        </div>
      )}
      {section === 'storage' && <StorageSection />}
      {section === 'security' && (
        <Card className="space-y-4">
          <div className="flex items-center gap-2 font-bold"><Shield className="size-4 text-accent" /> Security & privacy</div>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted">
            <li>Provider keys set as server environment variables never reach the browser.</li>
            <li>Keys entered in the app are stored only on this device and sent to this app&apos;s server over HTTPS per request; they are never logged.</li>
            <li>The server proxy only talks to fixed provider hosts. Self-hosted endpoints are called directly from your device.</li>
            <li>Set <code>APP_ACCESS_TOKEN</code> on the server so only you can use its AI proxy, and enter the same token below.</li>
          </ul>
          <Field label="App access token" hint="Must match APP_ACCESS_TOKEN on the server (if set).">
            <div className="flex gap-2">
              <SecretText value={settings.appToken ?? ''} onSave={(v) => save({ appToken: v || undefined })} />
              <Button icon={<KeyRound className="size-4" />} onClick={async () => {
                const s = await serverStatus();
                toast('error' in s ? s.error : 'Server accepted the token', 'error' in s ? 'error' : 'success');
              }}>Check</Button>
            </div>
          </Field>
        </Card>
      )}
    </div>
  );
}
