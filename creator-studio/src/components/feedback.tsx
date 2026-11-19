'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { setApprovalHandler, type ApprovalRequest } from '@/services/ai/approval';
import { Button, Sheet, cn } from './ui';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
  action?: { label: string; run: () => void };
}
interface ConfirmReq {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}

interface FeedbackApi {
  toast: (text: string, tone?: ToastTone, action?: Toast['action']) => void;
  confirm: (opts: { title: string; body: ReactNode; confirm?: string; danger?: boolean }) => Promise<boolean>;
}

const Ctx = createContext<FeedbackApi>({ toast: () => {}, confirm: async () => false });
export const useFeedback = () => useContext(Ctx);

let nextId = 1;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmReq, setConfirmReq] = useState<ConfirmReq | null>(null);
  const [approval, setApproval] = useState<(ApprovalRequest & { resolve: (v: boolean) => void }) | null>(null);

  const toast = useCallback((text: string, tone: ToastTone = 'info', action?: Toast['action']) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, tone, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 9000 : action ? 15000 : 4500);
  }, []);

  const confirm = useCallback(
    (opts: { title: string; body: ReactNode; confirm?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => setConfirmReq({ title: opts.title, body: opts.body, confirm: opts.confirm ?? 'Confirm', danger: opts.danger, resolve })),
    [],
  );

  useEffect(() => {
    setApprovalHandler((req) => new Promise<boolean>((resolve) => setApproval({ ...req, resolve })));
    return () => setApprovalHandler(null);
  }, []);

  const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border bg-surface/95 px-4 py-3 text-sm shadow-2xl backdrop-blur',
                t.tone === 'error' ? 'border-danger/40' : t.tone === 'success' ? 'border-success/40' : t.tone === 'warning' ? 'border-warning/40' : 'border-line-strong',
              )}
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-success' : t.tone === 'warning' ? 'text-warning' : 'text-accent-2')} />
              <span className="flex-1">{t.text}</span>
              {t.action && (
                <button className="font-bold text-accent" onClick={t.action.run}>
                  {t.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Sheet
        open={!!confirmReq}
        onClose={() => {
          confirmReq?.resolve(false);
          setConfirmReq(null);
        }}
        title={confirmReq?.title ?? ''}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                confirmReq?.resolve(false);
                setConfirmReq(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={confirmReq?.danger ? 'danger' : 'primary'}
              onClick={() => {
                confirmReq?.resolve(true);
                setConfirmReq(null);
              }}
            >
              {confirmReq?.confirm}
            </Button>
          </>
        }
      >
        <div className="text-sm text-ink/90">{confirmReq?.body}</div>
      </Sheet>
      <Sheet
        open={!!approval}
        onClose={() => {
          approval?.resolve(false);
          setApproval(null);
        }}
        title="Approve paid AI usage"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                approval?.resolve(false);
                setApproval(null);
              }}
            >
              Don&apos;t send
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                approval?.resolve(true);
                setApproval(null);
              }}
            >
              Approve {approval?.count} request{approval && approval.count > 1 ? 's' : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p>
            <b>{approval?.providerName}</b> bills per request. Nothing is sent until you approve.
          </p>
          <p>
            Action: <b>{approval?.action}</b> — {approval?.count} request{approval && approval.count > 1 ? 's' : ''}.
          </p>
          <p className="text-muted">Approval lasts only for these requests. Free providers never ask.</p>
        </div>
      </Sheet>
    </Ctx.Provider>
  );
}
