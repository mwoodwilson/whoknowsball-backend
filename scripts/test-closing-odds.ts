import * as dotenv from 'dotenv';
import { ClosingOddsCapture } from '../src/services/odds/ClosingOddsCapture';

// Load environment variables
dotenv.config();

/**
 * Test script for ClosingOddsCapture service
 * Tests the capture window logic with various time scenarios
 */

const captureService = new ClosingOddsCapture();

console.log('=== Testing Closing Odds Capture Window Logic ===\n');

// Test various time scenarios
const testCases = [
  { secondsUntil: 100, shouldCapture: false, description: '100 seconds before (too early)' },
  { secondsUntil: 40, shouldCapture: true, description: '40 seconds before (start of window)' },
  { secondsUntil: 35, shouldCapture: true, description: '35 seconds before (middle of window)' },
  { secondsUntil: 30, shouldCapture: true, description: '30 seconds before (end of window)' },
  { secondsUntil: 25, shouldCapture: false, description: '25 seconds before (too late)' },
  { secondsUntil: 10, shouldCapture: false, description: '10 seconds before (too late)' },
  { secondsUntil: 0, shouldCapture: false, description: 'At game start (too late)' },
  { secondsUntil: -10, shouldCapture: false, description: 'Game already started' }
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const now = new Date();
  const commenceTime = new Date(now.getTime() + testCase.secondsUntil * 1000);

  const result = captureService.isWithinCaptureWindow(commenceTime, now);
  const expectedResult = testCase.shouldCapture;

  if (result === expectedResult) {
    console.log(`✅ PASS: ${testCase.description}`);
    console.log(`   Expected: ${expectedResult}, Got: ${result}\n`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${testCase.description}`);
    console.log(`   Expected: ${expectedResult}, Got: ${result}\n`);
    failed++;
  }
}

console.log('=== Test Results ===');
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failed === 0) {
  console.log('\n✅ All tests passed!');
} else {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
}

// Test stats
console.log('\n=== Testing Stats ===');
captureService.getStats().then(stats => {
  console.log(`Total upcoming games: ${stats.total_games}`);
  console.log(`Games with closing odds: ${stats.with_closing_odds}`);
  console.log(`Capture rate: ${stats.capture_rate}%`);
});
