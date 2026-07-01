import * as dotenv from 'dotenv';
dotenv.config();

import { makeClient, requestAndWait } from '../src/croo';

async function main() {
  const buyerKey = process.env.BUYER_SDK_KEY!;
  const echoServiceId = process.env.ECHO_SERVICE_ID!;

  const client = makeClient(buyerKey);
  const stream = await client.connectWebSocket();
  console.log('Connected. Fanning out 3 parallel orders...');

  const t0 = Date.now();
  const results = await Promise.all([
    requestAndWait(client, stream, echoServiceId, '{"leg": "A"}'),
    requestAndWait(client, stream, echoServiceId, '{"leg": "B"}'),
    requestAndWait(client, stream, echoServiceId, '{"leg": "C"}'),
  ]);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  console.log(`--- ALL 3 COMPLETED in ${secs}s ---`);
  results.forEach((r, i) => {
    console.log(`leg ${i}: order=${r.orderId.slice(0, 8)} text=${r.text}`);
  });

  stream.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('test-fanout3 error:', err);
  process.exit(1);
});
