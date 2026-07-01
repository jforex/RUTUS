import { amountAnomalySignal, gate, SignalResult } from '../src/underwriter';

// Simulate a risky transfer: big amount, plus two external signals.
const req = { action_type: 'transfer', chain: 'base', amount: 50000, destination: '0xABC' };

const amount = amountAnomalySignal(req);
const wallet: SignalResult = { signal: 'wallet_reputation', score: 65, source: 'sub-A', ok: true, note: 'Destination wallet is 3 days old' };
const contract: SignalResult = { signal: 'contract_safety', score: 70, source: 'sub-C', ok: true, note: 'Unverified contract' };

console.log('amount signal:', amount);
console.log('VERDICT:', JSON.stringify(gate(req, [amount, wallet, contract]), null, 2));

// Edge case: only the internal signal responded (externals failed).
console.log('DEGRADED:', JSON.stringify(gate(req, [amount,
  { signal: 'wallet_reputation', score: 0, source: 'sub-A', ok: false },
  { signal: 'contract_safety', score: 0, source: 'sub-C', ok: false },
]), null, 2));
