import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { whatsappSessionManager } from '../services/whatsappSessionManager';

async function runTests() {
  console.log('=======================================================');
  console.log('🧪 Testing RailIo Meta WhatsApp Cloud API Integration');
  console.log('=======================================================');

  const testPhone = '+15556783260';

  console.log('\n--- Test 1: User sends "Hi" (Greeting / Main Menu) ---');
  await whatsappSessionManager.processIncomingMessage(testPhone, 'Hi');

  console.log('\n--- Test 2: User taps "🎯 Catch Train?" button ---');
  await whatsappSessionManager.processIncomingMessage(testPhone, 'Catch Train?', 'btn_catch_train');

  console.log('\n--- Test 3: User shares Location Pin ---');
  await whatsappSessionManager.processIncomingMessage(
    testPhone,
    undefined,
    undefined,
    { latitude: 22.7105475, longitude: 88.386681 }
  );

  console.log('\n--- Test 4: User sends Destination "Dankuni" ---');
  await whatsappSessionManager.processIncomingMessage(testPhone, 'Dankuni');

  console.log('\n--- Test 5: User asks for Live Train Status ---');
  await whatsappSessionManager.processIncomingMessage(testPhone, 'Train Status', 'btn_live_status');

  console.log('\n✅ All WhatsApp integration tests completed successfully!');
}

runTests().catch((err) => console.error('Test error:', err));
