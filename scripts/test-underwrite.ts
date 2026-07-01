import * as dotenv from 'dotenv';
dotenv.config();

import { makeClient, requestAndWait } from '../src/croo';

async function main() {
  const buyerKey = process.env.BUYER_SDK_KEY!;
  const underwriterServiceId = process.env.UNDERWRITER_SERVICE_ID!;

  const client = makeClient(buyerKey);
  const stream = await client.connectWebSocket();
  console.log('Buyer connected. Requesting underwrite...');

  const action = JSON.stringify({
    action_type: 'transfer',
    chain: 'base',
    amount: 50000,
    destination: '0xABC0000000000000000000000000000000000123',
    context: 'first-time counterparty',
  });

  const result = await requestAndWait(client, stream, underwriterServiceId, action);

  console.log('--- UNDERWRITER VERDICT ---');
  console.log(result.schema ?? result.text);

  stream.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('test-underwrite error:', err);
  process.exit(1);
});
