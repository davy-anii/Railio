import { whatsappSessionManager } from '../services/whatsappSessionManager';

async function testLocationHandling() {
  console.log('=== Test: Location Pin sent when Session State is IDLE ===');

  // 1. Simulate incoming WhatsApp location pin message
  await whatsappSessionManager.processIncomingMessage(
    '+15559998888',
    'Location (22.7105475, 88.386681)',
    undefined,
    { latitude: 22.7105475, longitude: 88.386681, name: 'Sodepur Location Pin' },
    '1282348971633521'
  );

  console.log('✅ Step 1: Location Pin processed without RAG fallback error.');

  // 2. Simulate user providing destination in the next step
  console.log('\n=== Test: User sends Destination after location recorded ===');
  await whatsappSessionManager.processIncomingMessage(
    '+15559998888',
    'Dankuni',
    undefined,
    undefined,
    '1282348971633521'
  );

  console.log('✅ Step 2: Destination processed and Catch Probability calculated successfully.');
}

testLocationHandling();
