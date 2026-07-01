'use client';

import { useState } from 'react';
import { gate, amountAnomalySignal, SignalResult, UnderwriteRequest } from '@/lib/underwriter';

const RED = '#C41E28';
const COLORS: Record<string, string> = { APPROVE: '#1B8A5A', REVIEW: '#D98A0B', REJECT: '#C41E28' };
type Profile = 'clean' | 'mixed' | 'bad';

function walletSig(p: Profile): SignalResult {
  const m = { clean: { score: 10, note: 'health 90/100 · EXCELLENT' }, mixed: { score: 55, note: 'risk level · MEDIUM' }, bad: { score: 88, note: 'risk level · CRITICAL' } }[p];
  return { signal: 'wallet_reputation', score: m.score, source: 'sub:web3intel', ok: true, note: m.note };
}
function contractSig(p: Profile): SignalResult {
  const m = { clean: { score: 12, note: 'verdict · Safe' }, mixed: { score: 48, note: 'verdict · Risky' }, bad: { score: 90, note: 'verdict · Dangerous' } }[p];
  return { signal: 'contract_safety', score: m.score, source: 'sub:chainguard', ok: true, note: m.note };
}

const LABELS: Record<string, string> = { amount_anomaly: 'internal · amount', wallet_reputation: 'Web3 Address Intel', contract_safety: 'ChainGuard' };
const PRICES: Record<string, string> = { amount_anomaly: 'free', wallet_reputation: '$0.10', contract_safety: '$0.15' };
const ORDER = ['amount_anomaly', 'wallet_reputation', 'contract_safety'];
type Stage = 'idle' | 'running' | 'done';

export default function Home() {
  const [atype, setAtype] = useState('transfer');
  const [amount, setAmount] = useState(50000);
  const [dest, setDest] = useState('0x6B17…71d0F');
  const [profile, setProfile] = useState<Profile>('mixed');
  const [stage, setStage] = useState<Stage>('idle');
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  const [sigMap, setSigMap] = useState<Record<string, SignalResult>>({});
  const [verdict, setVerdict] = useState<ReturnType<typeof gate> | null>(null);

  function run() {
    const req: UnderwriteRequest = { action_type: atype, amount, destination: dest, chain: 'base' };
    const sigs: Record<string, SignalResult> = {
      amount_anomaly: amountAnomalySignal(req),
      wallet_reputation: walletSig(profile),
      contract_safety: contractSig(profile),
    };
    setSigMap(sigs); setStage('running'); setResolved({}); setVerdict(null);
    const delays: Record<string, number> = { amount_anomaly: 550, wallet_reputation: 1500, contract_safety: 2300 };
    ORDER.forEach((k) => setTimeout(() => setResolved((r) => ({ ...r, [k]: true })), delays[k]));
    setTimeout(() => { setVerdict(gate(req, [sigs.amount_anomaly, sigs.wallet_reputation, sigs.contract_safety])); setStage('done'); }, 2900);
  }

  return (
    <main style={{ background: '#050506', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>

      <div style={{ width: '100%', maxWidth: 960, marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#5A5A5E' }}>PRE-EXECUTION RISK GATE FOR AUTONOMOUS AGENTS</div>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#E8E8E6', margin: '10px 0 0', letterSpacing: 0.5, lineHeight: 1.3, maxWidth: 640 }}>
          Before an agent acts, it asks RUTUS: <span style={{ color: RED }}>should I do this?</span>
        </h1>
      </div>

      <div style={{ width: '100%', maxWidth: 960, background: '#0B0B0C', border: '1px solid #1E1E20', borderRadius: 16, overflow: 'hidden', color: '#E8E8E6' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #1E1E20', background: '#0E0E10' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden>
              <rect x="26" y="22" width="30" height="30" fill={RED} />
              <path d="M42 40 h14 a14 14 0 0 1 0 28 h-2 l16 16 h-14 l-16 -16 v-28 z" fill={RED} />
              <path d="M66 26 l12 0 0 12 M78 26 l-16 16" stroke={RED} strokeWidth="4" fill="none" />
            </svg>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: 2 }}>RUTUS</div>
              <div style={{ fontSize: 10, color: '#6A6A6E', letterSpacing: 0.5 }}>AGENT UNDERWRITER</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: '#6A6A6E' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1B8A5A', display: 'inline-block', boxShadow: '0 0 6px #1B8A5A' }} />
            CAP · BASE MAINNET
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr' }}>

          <div style={{ padding: 28, borderRight: '1px solid #1E1E20' }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#6A6A6E', marginBottom: 20 }}>▸ PROPOSED ACTION</div>

            <FLabel>ACTION TYPE</FLabel>
            <select value={atype} onChange={(e) => setAtype(e.target.value)} style={field}>
              <option value="transfer">transfer</option>
              <option value="swap">swap</option>
              <option value="approve">approve</option>
              <option value="contract_call">contract_call</option>
            </select>

            <FLabel>AMOUNT · USDC</FLabel>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={field} />

            <FLabel>DESTINATION</FLabel>
            <input type="text" value={dest} onChange={(e) => setDest(e.target.value)} style={field} />

            <FLabel>COUNTERPARTY PROFILE · DEMO</FLabel>
            <select value={profile} onChange={(e) => setProfile(e.target.value as Profile)} style={{ ...field, marginBottom: 24 }}>
              <option value="clean">known-good address</option>
              <option value="mixed">mixed / first-time</option>
              <option value="bad">flagged / risky</option>
            </select>

            <button onClick={run} style={{ width: '100%', background: RED, color: '#fff', border: 'none', borderRadius: 7, height: 46, fontSize: 12, fontWeight: 600, letterSpacing: 1.5, cursor: 'pointer', fontFamily: 'inherit' }}>UNDERWRITE ▸</button>
          </div>

          <div style={{ padding: 28, minHeight: 420, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#6A6A6E', marginBottom: 20 }}>▸ FAN-OUT · SIGNALS</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 28 }}>
              {ORDER.map((k) => {
                const done = resolved[k];
                const active = stage !== 'idle';
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '13px 15px', background: '#141416', border: `1px solid ${done ? '#242427' : '#1E1E20'}`, borderRadius: 8, opacity: active ? 1 : 0.4, transition: 'opacity 0.3s, border-color 0.3s' }}>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ color: !active ? '#3A3A3E' : done ? '#1B8A5A' : RED }} className={active && !done ? 'spin' : ''}>{!active ? '○' : done ? '✓' : '◠'}</span>
                      <span>{LABELS[k]}</span>
                      <span style={{ fontSize: 10, color: '#4A4A4E', border: '1px solid #242427', borderRadius: 4, padding: '1px 6px' }}>{PRICES[k]}</span>
                    </span>
                    <span style={{ color: !active ? '#3A3A3E' : done ? '#8A8A8E' : '#4A4A4E' }}>{!active ? 'ready' : done ? (sigMap[k]?.note ?? '') : 'querying…'}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px solid #1E1E20', paddingTop: 24, marginTop: 'auto', minHeight: 150 }}>
              {stage !== 'done' || !verdict ? (
                <div style={{ color: '#4A4A4E', fontSize: 11, letterSpacing: 1, textAlign: 'center', paddingTop: 40 }}>
                  {stage === 'idle' ? 'AWAITING ACTION · VERDICT WILL RESOLVE HERE' : 'COMBINING SIGNALS THROUGH THE GATE…'}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                      <span style={{ fontSize: 60, fontWeight: 600, lineHeight: 0.85, color: COLORS[verdict.verdict] }}>{verdict.risk_score}</span>
                      <span style={{ fontSize: 11, color: '#6A6A6E' }}>/100<br />RISK</span>
                    </div>
                    <div style={{ display: 'inline-block', fontSize: 14, fontWeight: 600, letterSpacing: 2, padding: '6px 18px', borderRadius: 5, marginTop: 14, background: COLORS[verdict.verdict], color: '#fff' }}>{verdict.verdict}</div>
                  </div>
                  <div style={{ flex: 1, fontSize: 11, color: '#8A8A8E', lineHeight: 1.8 }}>
                    <div style={{ color: '#6A6A6E', marginBottom: 8 }}>CONFIDENCE {verdict.confidence}% · {verdict.evidence.length}/3 SIGNALS</div>
                    <div style={{ marginBottom: 6 }}><span style={{ color: '#5A5A5E' }}>reason ▸ </span>{verdict.reasons.join(' · ')}</div>
                    <div><span style={{ color: '#5A5A5E' }}>evidence ▸ </span>{verdict.evidence.length} paid sub-orders settled on CAP</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '13px 24px', borderTop: '1px solid #1E1E20', background: '#0E0E10', fontSize: 10, color: '#4A4A4E', textAlign: 'center', letterSpacing: 0.5 }}>
          runs the real gate logic from the agent · live agent settles paid sub-orders on CAP
        </div>
      </div>

      <style>{`
        @keyframes spinr { to { transform: rotate(360deg); } }
        .spin { display: inline-block; animation: spinr 0.7s linear infinite; }
        button:hover { background: #A32D2D !important; }
        button:active { transform: scale(0.99); }
        select:focus, input:focus { outline: none; border-color: ${RED} !important; }
        select option { background: #141416; }
      `}</style>
    </main>
  );
}

function FLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 10, letterSpacing: 1, color: '#6A6A6E', display: 'block', marginBottom: 6 }}>{children}</label>;
}
const field: React.CSSProperties = { width: '100%', marginBottom: 16, background: '#141416', color: '#E8E8E6', border: '1px solid #2A2A2D', borderRadius: 7, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' };
