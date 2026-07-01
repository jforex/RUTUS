import * as dotenv from 'dotenv';
dotenv.config();

import { makeClient, requestAndWait } from '../src/croo';

async function main() {
  const buyerKey = process.env.BUYER_SDK_KEY!;
  const echoServiceId = process.env.ECHO_SERVICE_ID!;

  const client = makeClient(buyerKey);
  const stream = await client.connectWebSocket();
  stream.onAny((e: any) => console.log('[REQUESTER EVENT]', e.type, e.order_id));
  console.log('Connected. Requesting echo service...');

  const result = await requestAndWait(
    client,
    stream,
    echoServiceId,
    '{"task": "ping from underwriter test"}'
  );

  console.log('--- RESULT ---');
  console.log('orderId:', result.orderId);
  console.log('text:', result.text);
  console.log('schema:', result.schema);

  stream.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('test-fanout error:', err);
  process.exit(1);
});
