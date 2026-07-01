// ── Underwriter core: schema + deterministic signals + Gate logic ──
// Pure module: no network. Testable in isolation.

export interface UnderwriteRequest {
  action_type: string;          // transfer | contract_call | swap | approve | ... (general later)
  chain?: string;
  amount?: number;              // value at stake, in USDC
  destination?: string;         // wallet or contract address
  context?: string;             // optional free text
}

export type Verdict = 'APPROVE' | 'REVIEW' | 'REJECT';

export interface SignalResult {
  signal: string;               // wallet_reputation | amount_anomaly | contract_safety
  score: number;                // 0 (safe) .. 100 (dangerous)
  source: string;               // sub-agent id, or "internal"
  ok: boolean;                  // false if the signal failed to produce a result
  note?: string;                // short human-readable finding
}

export interface UnderwriteVerdict {
  risk_score: number;           // 0..100
  verdict: Verdict;
  confidence: number;           // 0..100
  reasons: string[];
  evidence: Array<{ signal: string; score: number; source: string }>;
}

// Relative weights per signal. Amount anomaly is internal & always available,
// so it carries solid weight; external signals are advisory.
const WEIGHTS: Record<string, number> = {
  wallet_reputation: 0.4,
  contract_safety: 0.35,
  amount_anomaly: 0.25,
};

// ── Signal 1 (internal, deterministic): amount anomaly ──
// Flags amounts that are large in absolute terms or unusual for the action type.
// No network: this always returns a result, giving the Underwriter a floor.
export function amountAnomalySignal(req: UnderwriteRequest): SignalResult {
  const amount = req.amount ?? 0;
  let score = 0;
  const notes: string[] = [];

  // Absolute-size tiers (USDC).
  if (amount >= 100_000) { score += 60; notes.push('Very large amount (>= $100k)'); }
  else if (amount >= 25_000) { score += 40; notes.push('Large amount (>= $25k)'); }
  else if (amount >= 5_000) { score += 20; notes.push('Moderate amount (>= $5k)'); }

  // Action-type sensitivity: approvals/contract calls are riskier per dollar.
  if (req.action_type === 'approve' && amount > 0) {
    score += 20; notes.push('Token approval can grant ongoing spend access');
  }
  if (req.action_type === 'contract_call') {
    score += 10; notes.push('Contract interaction carries execution risk');
  }

  score = Math.min(100, score);
  return {
    signal: 'amount_anomaly',
    score,
    source: 'internal',
    ok: true,
    note: notes.join('; ') || 'Amount within normal range',
  };
}

// ── The Gate: combine signals into a final verdict ──
// Uses only signals that succeeded (ok=true), reweighted among themselves.
// Confidence scales with how many signals actually responded.
export function gate(req: UnderwriteRequest, signals: SignalResult[]): UnderwriteVerdict {
  const good = signals.filter((s) => s.ok);

  // Weighted risk over available signals (renormalize weights to those present).
  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of good) {
    const w = WEIGHTS[s.signal] ?? 0.2;
    weightedSum += s.score * w;
    weightTotal += w;
  }
  const risk_score = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 50;

  // Verdict thresholds.
  let verdict: Verdict;
  if (risk_score < 30) verdict = 'APPROVE';
  else if (risk_score <= 70) verdict = 'REVIEW';
  else verdict = 'REJECT';

  // Confidence: more responding signals => more confident. 3/3 => high.
  const responded = good.length;
  const expected = 3;
  const confidence = Math.round((responded / expected) * 100);

  // Reasons: pull notes from signals that contributed meaningfully.
  const reasons = good
    .filter((s) => s.note && s.score > 0)
    .map((s) => s.note as string);
  if (reasons.length === 0) reasons.push('No significant risk factors detected');
  if (responded < expected) {
    reasons.push(`Only ${responded}/${expected} risk signals available — confidence reduced`);
  }

  return {
    risk_score,
    verdict,
    confidence,
    reasons,
    evidence: good.map((s) => ({ signal: s.signal, score: s.score, source: s.source })),
  };
}
