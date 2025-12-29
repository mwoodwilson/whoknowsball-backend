require('dotenv').config();

// Import the SettlementJob
const { SettlementJob } = require('../dist/services/jobs/SettlementJob');

async function main() {
  console.log('🚀 Manually triggering SettlementJob...');
  console.log('');

  const job = new SettlementJob();
  await job.run();

  console.log('');
  console.log('✅ SettlementJob completed!');
}

main().catch(console.error);
