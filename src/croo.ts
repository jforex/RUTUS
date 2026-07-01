import { AgentClient, EventType, DeliverableType, OrderStatus } from '@croo-network/sdk';

export function makeClient(sdkKey: string): AgentClient {
  return new AgentClient(
    {
      baseURL: process.env.CROO_API_URL!,
      wsURL: process.env.CROO_WS_URL!,
      rpcURL: process.env.BASE_RPC_URL,
    },
    sdkKey
  );
}

export interface SubOrderResult {
  orderId: string;
  text?: string;
  schema?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Requester-side helper. Negotiates a service, pays its OWN order (matched by
// negotiationId so parallel calls never cross), polls until Completed, then
// returns the delivery. Polling makes parallel fan-out resilient to settlement lag.
export function requestAndWait(
  client: AgentClient,
  stream: any,
  serviceId: string,
  requirements: string,
  timeoutMs = 300_000,
  pollMs = 5_000
): Promise<SubOrderResult> {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    let myNegotiationId: string | null = null;
    let myOrderId: string | null = null;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    // Claim only the order_created that belongs to OUR negotiation.
    const onCreated = async (e: any) => {
      if (settled || myOrderId) return;
      if (!myNegotiationId || e.negotiation_id !== myNegotiationId) return;
      if (!e.order_id) return;
      myOrderId = e.order_id;
      try {
        await client.payOrder(e.order_id);
      } catch (err) {
        finish(() => reject(err));
      }
    };
    stream.on(EventType.OrderCreated, onCreated);

    // Start negotiation and record our negotiationId.
    try {
      const negotiation = await client.negotiateOrder({ serviceId, requirements });
      myNegotiationId = negotiation.negotiationId;
    } catch (err) {
      finish(() => reject(err));
      return;
    }

    // Poll our order until it reaches Completed.
    const start = Date.now();
    while (!settled) {
      if (Date.now() - start > timeoutMs) {
        finish(() => reject(new Error(`requestAndWait timed out for ${serviceId}`)));
        return;
      }
      if (myOrderId) {
        try {
          const order = await client.getOrder(myOrderId);
          if (order.status === OrderStatus.Completed) {
            const delivery = await client.getDelivery(myOrderId);
            finish(() =>
              resolve({
                orderId: myOrderId!,
                text:
                  delivery.deliverableType === DeliverableType.Text
                    ? delivery.deliverableText
                    : undefined,
                schema:
                  delivery.deliverableType === DeliverableType.Schema
                    ? delivery.deliverableSchema
                    : undefined,
              })
            );
            return;
          }
        } catch {
          // transient; keep polling
        }
      }
      await sleep(pollMs);
    }
  });
}
