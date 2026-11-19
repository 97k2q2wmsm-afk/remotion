import type { ProviderConfig } from '@/types';
import { adapterInfo } from '@/config/providers';

export interface ApprovalRequest {
  providerName: string;
  action: string;
  count: number;
}

type Handler = (req: ApprovalRequest) => Promise<boolean>;
let handler: Handler | null = null;

/** The UI registers a dialog here. Without a dialog, paid calls are refused (never silently made). */
export function setApprovalHandler(fn: Handler | null) {
  handler = fn;
}

// Remaining approved paid requests per provider for this page session only.
const budget = new Map<string, number>();

export function isPaid(p: ProviderConfig): boolean {
  return adapterInfo(p.type)?.billing === 'paid';
}

export class ApprovalDeniedError extends Error {
  constructor(provider: string) {
    super(`Paid request to ${provider} was not approved, so nothing was sent.`);
    this.name = 'ApprovalDeniedError';
  }
}

/** Ask once for a batch of `count` paid requests. Free/self-hosted providers pass straight through. */
export async function approvePaid(p: ProviderConfig, action: string, count = 1): Promise<void> {
  if (!isPaid(p)) return;
  const left = budget.get(p.id) ?? 0;
  if (left >= count) return;
  if (!handler) throw new ApprovalDeniedError(p.name);
  const ok = await handler({ providerName: p.name, action, count });
  if (!ok) throw new ApprovalDeniedError(p.name);
  budget.set(p.id, left + count);
}

export function consumePaid(p: ProviderConfig) {
  if (!isPaid(p)) return;
  const left = budget.get(p.id) ?? 0;
  if (left <= 0) throw new ApprovalDeniedError(p.name);
  budget.set(p.id, left - 1);
}

export function clearPaidBudget(providerId?: string) {
  if (providerId) budget.delete(providerId);
  else budget.clear();
}
