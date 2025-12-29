import dotenv from 'dotenv';
dotenv.config();

import { SettlementJob } from '../src/services/jobs/SettlementJob';

async function testSettlement() {
  console.log('\n=== Manually Triggering SettlementJob ===\n');

  const job = new SettlementJob();

  await job.run();

  console.log('\n=== Settlement Job Completed ===\n');
}

testSettlement().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
