# RUTUS — The Agent Underwriter

**RUTUS is a paid, callable risk-underwriting agent for the CROO Agent Store.**
Before an AI agent takes a high-stakes action — sending funds, interacting with a
contract, approving spend — it asks RUTUS one question: *should I do this?*

RUTUS does not answer alone. It is an **orchestrator**: one incoming paid order
fans out into multiple paid sub-orders to specialist verification agents, combines
their findings with its own deterministic checks, and returns a single structured
verdict — `APPROVE` / `REVIEW` / `REJECT` — with a risk score, confidence, and an
evidence trail showing which agent contributed what.

- **Tracks:** Data & Verification Agents (primary) · Open — Any A2A Agents
- **Network:** CAP on Base mainnet (real USDC settlement)
- **License:** MIT

---

## Why this exists

Autonomous agents are starting to move money and take irreversible on-chain
actions. Today, when one agent is about to act, nothing checks that action first.
There is no underwriting layer.

RUTUS is that layer. It sits between an agent and its risky action, the way an
insurance underwriter inspects a risk before it is accepted — except RUTUS prices
risk by *paying other agents* to inspect the specifics, then issuing a verdict.

**How this differs from agent-auditing tools.** Some CROO agents audit *whether an
agent is trustworthy* — a static, one-time check before you hire it. RUTUS audits
*whether a specific action is safe to take* — a dynamic check, in real time, every
time an action carries risk. Different question, different moment, different caller.

---

## How it works

Buyer agent --pays--> RUTUS
|
|- internal signal: amount anomaly (deterministic)
|
|-pays--> Web3 Address Intel (wallet reputation)
|
|-pays--> ChainGuard (contract safety)
|
v
Gate: combine signals --> Verdict
|
Buyer agent <--delivers--+ { risk, verdict, confidence, reason, evidence }

Every arrow marked `pays` is a real CAP order settled on-chain. A single call to
RUTUS produces multiple paid A2A sub-orders to independent counterparty agents.

### The three signals

| Signal | Source | Notes |
|---|---|---|
| `amount_anomaly` | **Internal**, deterministic | Always available. Flags large or action-type-sensitive amounts. Gives RUTUS a reliable floor even if external agents fail. |
| `wallet_reputation` | **Web3 Address Intel** (paid sub-order) | Multi-chain address risk. Their health score (high = safe) is inverted to our risk scale (high = dangerous). |
| `contract_safety` | **ChainGuard** (paid sub-order) | Token/contract honeypot & rug-pull risk. Score used directly (high = dangerous). |

### The Gate

The Gate combines whatever signals succeeded into a weighted risk score (0-100),
maps it to a verdict (`<30 APPROVE`, `30-70 REVIEW`, `>70 REJECT`), and sets
confidence based on how many signals responded. **Graceful degradation is built
in:** if an external agent is slow or offline, RUTUS still returns a useful verdict
from the remaining signals, with reduced confidence stated explicitly.

---

## Input / Output

**Input** (what a buyer sends):

```json
{
  "action_type": "transfer",
  "chain": "base",
  "amount": 50000,
  "destination": "0x...",
  "context": "first-time counterparty"
}
```

**Output** (the verdict RUTUS delivers):

```json
{
  "risk": 72,
  "verdict": "REVIEW",
  "confidence": 100,
  "reason": "Large amount (>= $25k); Wallet risk level: HIGH; Contract verdict: RISKY",
  "evidence": "[{\"signal\":\"amount_anomaly\",\"score\":40,\"source\":\"internal\"}]"
}
```

`evidence` is a JSON string; parse it to inspect each contributing signal and its
source — this is the provenance trail.

---

## Architecture

src/
croo.ts Thin SDK wrapper. requestAndWait() turns the event-driven CAP
order lifecycle into an awaitable promise, matched by
negotiationId so parallel fan-out never crosses wires.
underwriter.ts Pure logic: schema types, the deterministic amount_anomaly
signal, and the Gate. No network — unit-testable in isolation.
signals.ts Adapters that map each real sub-agent's response onto the
normalized 0-100 risk scale (incl. health-score inversion).
provider.ts The RUTUS agent. Accepts an order, fans out paid sub-orders,
runs the Gate, delivers a schema verdict.
scripts/
test-gate.ts Unit test for the Gate (no network).
test-underwrite.ts End-to-end: a buyer pays RUTUS and prints the verdict.

The order lifecycle observed on CAP: `created -> paying -> paid -> delivering ->
evaluating -> completed`. requestAndWait polls to completion, resilient to
settlement lag so parallel sub-orders don't hang on one slow leg.

---

## Run it

### Prerequisites
- Node 18+
- A CROO agent (SDK key) for RUTUS, its wallet funded with USDC on Base
- The service IDs of the sub-agents you fan out to

### Setup

```bash
git clone https://github.com/jforex/RUTUS.git
cd RUTUS
npm install
cp .env.example .env   # then fill in the values below
```

`.env`:

```bash
CROO_API_URL="https://api.croo.network"
CROO_WS_URL="wss://api.croo.network/ws"

UNDERWRITER_SDK_KEY="croo_sk_..."           # RUTUS's own key
WALLET_REP_SERVICE_ID="..."                 # Web3 Address Intel service
CONTRACT_SAFETY_SERVICE_ID="..."            # ChainGuard Token Analyzer service

BUYER_SDK_KEY="croo_sk_..."                 # a second agent, to test-call RUTUS
UNDERWRITER_SERVICE_ID="..."                # RUTUS's own service id
```

### Test the Gate (no network, instant)

```bash
npx ts-node scripts/test-gate.ts
```

### Run RUTUS and call it end-to-end

Terminal 1 — start RUTUS:
```bash
npx ts-node src/provider.ts        # -> "Underwriter online. Waiting for orders..."
```

Terminal 2 — a buyer calls it:
```bash
npx ts-node scripts/test-underwrite.ts
```

The buyer pays RUTUS; RUTUS fans out paid sub-orders to the sub-agents, runs the
Gate, and delivers the verdict, which the buyer prints. Nested settlement takes a
few minutes on mainnet.

---

## SDK methods used

`connectWebSocket`, `negotiateOrder`, `payOrder`, `getOrder`, `getDelivery`
(requester side); `acceptNegotiation`, `getNegotiation`, `deliverOrder`
(provider side). Deliverables use `DeliverableType.Schema`.

---

## Roadmap

- Continuous re-underwriting (monitor an action's risk over time)
- More specialist signals (sanctions proximity, approval-exposure, velocity)
- Configurable risk policies per buyer
