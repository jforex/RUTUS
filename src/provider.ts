import * as dotenv from 'dotenv';
dotenv.config();

import { EventType, DeliverableType } from '@croo-network/sdk';
import { makeClient, requestAndWait, SubOrderResult } from './croo';
import { amountAnomalySignal, gate } from './underwriter';
import {
  walletRepRequirements,
  walletRepSignal,
  contractSafetyRequirements,
  contractSafetySignal,
} from './signals';

function parseRequest(requirements: string) {
  try {
    const o = JSON.parse(requirements);
    return {
      action_type: String(o.action_type ?? 'unknown'),
      chain: o.chain,
      amount: typeof o.amount === 'number' ? o.amount : Number(o.amount) || 0,
      destination: o.destination,
      context: o.context,
    };
  } catch {
    return { action_type: 'unknown', amount: 0 };
  }
}

async function main() {
  const sdkKey = process.env.UNDERWRITER_SDK_KEY!;
  const walletRepServiceId = process.env.WALLET_REP_SERVICE_ID!;
  const contractSafetyServiceId = process.env.CONTRACT_SAFETY_SERVICE_ID!;

  const client = makeClient(sdkKey);
  const stream = await client.connectWebSocket();
  console.log('Underwriter online. Waiting for orders...');

  const negByOrder = new Map<string, string>();

  stream.on(EventType.NegotiationCreated, async (e: any) => {
    try {
      const result = await client.acceptNegotiation(e.negotiation_id);
      negByOrder.set(result.order.orderId, e.negotiation_id);
      console.log(`Accepted negotiation ${e.negotiation_id} -> order ${result.order.orderId}`);
    } catch (err) {
      console.error('accept error:', err);
    }
  });

  stream.on(EventType.OrderPaid, async (e: any) => {
    const orderId = e.order_id;
    console.log(`Order ${orderId} paid. Underwriting...`);

    const negId = negByOrder.get(orderId) ?? e.negotiation_id;
    let requirements = '{}';
    try {
      const negotiation = await client.getNegotiation(negId);
      requirements = negotiation.requirements || '{}';
    } catch (err) {
      console.error('getNegotiation error:', err);
    }
    const req = parseRequest(requirements);

    // Internal deterministic signal (always available).
    const amountSig = amountAnomalySignal(req);

    // External signals via real paid fan-out, each with its own input shape.
    let walletRes: SubOrderResult | null = null;
    let contractRes: SubOrderResult | null = null;
    try {
      [walletRes, contractRes] = await Promise.all([
        requestAndWait(client, stream, walletRepServiceId, walletRepRequirements(req)).catch(
          (err) => { console.error('wallet sub-order failed:', err?.message); return null; }
        ),
        requestAndWait(client, stream, contractSafetyServiceId, contractSafetyRequirements(req)).catch(
          (err) => { console.error('contract sub-order failed:', err?.message); return null; }
        ),
      ]);
    } catch (err) {
      console.error('fan-out error:', err);
    }

    const walletSig = walletRepSignal(walletRes);
    const contractSig = contractSafetySignal(contractRes);

    const verdict = gate(req, [amountSig, walletSig, contractSig]);
    console.log('Verdict:', JSON.stringify(verdict));

    // Map to the service's declared schema fields.
    const schemaPayload = {
      risk: verdict.risk_score,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      reason: verdict.reasons.join('; '),
      evidence: JSON.stringify(verdict.evidence),
    };

    try {
      await client.deliverOrder(orderId, {
        deliverableType: DeliverableType.Schema,
        deliverableSchema: JSON.stringify(schemaPayload),
      });
      console.log(`Order ${orderId} delivered.`);
    } catch (err) {
      console.error('deliver error:', err);
    }
  });

  stream.on(EventType.OrderCompleted, (e: any) => {
    console.log(`Order ${e.order_id} completed.`);
  });

  process.on('SIGINT', () => { stream.close(); process.exit(0); });
}

main().catch(console.error);
