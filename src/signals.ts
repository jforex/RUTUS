import { SubOrderResult } from './croo';
import { SignalResult, UnderwriteRequest } from './underwriter';

function parseDelivery(res: SubOrderResult | null): any | null {
  if (!res) return null;
  const raw = res.schema ?? res.text ?? '';
  try { return JSON.parse(raw); } catch { return null; }
}

// Web3 Address Intel input: { "walletAddresses": ["0x..."], "chain": "base" }
export function walletRepRequirements(req: UnderwriteRequest): string {
  return JSON.stringify({
    walletAddresses: [req.destination ?? ''],
    chain: req.chain ?? 'base',
  });
}

// Their healthScore is 0..100 where HIGH = SAFE, so invert: risk = 100 - health.
export function walletRepSignal(res: SubOrderResult | null): SignalResult {
  const d = parseDelivery(res);
  if (!d) return { signal: 'wallet_reputation', score: 0, source: 'sub:web3intel', ok: false };

  let score: number | null = null;
  let note = 'External wallet reputation check';

  if (typeof d.healthScore === 'number') {
    score = 100 - d.healthScore;
    note = `Wallet health ${d.healthScore}/100 (${d.healthGrade ?? 'n/a'})`;
  } else if (typeof d.riskLevelSummary === 'string') {
    const map: Record<string, number> = { LOW: 15, MEDIUM: 50, HIGH: 80, CRITICAL: 95 };
    score = map[d.riskLevelSummary.toUpperCase()] ?? 50;
    note = `Wallet risk level: ${d.riskLevelSummary}`;
  }

  if (score === null) return { signal: 'wallet_reputation', score: 0, source: 'sub:web3intel', ok: false };
  return { signal: 'wallet_reputation', score: Math.max(0, Math.min(100, score)), source: 'sub:web3intel', ok: true, note };
}

// ChainGuard Token Analyzer input: a plain token address string.
export function contractSafetyRequirements(req: UnderwriteRequest): string {
  return req.destination ?? '';
}

// Their rug-pull score is 0..100 where HIGH = DANGEROUS, so use directly.
export function contractSafetySignal(res: SubOrderResult | null): SignalResult {
  const d = parseDelivery(res);
  if (!d) return { signal: 'contract_safety', score: 0, source: 'sub:chainguard', ok: false };

  let score: number | null = null;
  let note = 'External contract safety check';

  const raw = d.rugPullRiskScore ?? d.rugPullScore ?? d.riskScore ?? d.score ?? d.overallScore;
  if (typeof raw === 'number') {
    score = raw;
    note = `Contract risk score ${raw}/100`;
  } else if (typeof d.verdict === 'string' || typeof d.safetyVerdict === 'string') {
    const v = (d.verdict ?? d.safetyVerdict).toString().toUpperCase();
    const map: Record<string, number> = { SAFE: 15, RISKY: 60, DANGEROUS: 90 };
    score = map[v] ?? 50;
    note = `Contract verdict: ${v}`;
  }

  if (score === null) return { signal: 'contract_safety', score: 0, source: 'sub:chainguard', ok: false };
  return { signal: 'contract_safety', score: Math.max(0, Math.min(100, score)), source: 'sub:chainguard', ok: true, note };
}
