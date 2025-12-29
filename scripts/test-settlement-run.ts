import dotenv from 'dotenv';
dotenv.config();

import { SettlementJob } from '../src/services/jobs/SettlementJob';

async function testSettlementRun() {
  console.log('\n=== Manually Running SettlementJob ===\n');

  const job = new SettlementJob();
  await job.run();

  console.log('\n=== Settlement Job Complete ===\n');
  process.exit(0);
}

testSettlementRun().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
