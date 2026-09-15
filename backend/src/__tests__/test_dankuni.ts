import { db } from '../models/dataStore';
import { whatsappSessionManager } from '../services/whatsappSessionManager';

async function testSealdahToDankuni() {
  console.log('=== Test: db.searchTrains("sealdah", "dankuni") ===');
  const results = db.searchTrains('sealdah', 'dankuni');
  console.log('Found trains count:', results ? results.length : 0);
  if (results && results.length > 0) {
    console.log('First train:', results[0].trainNumber, results[0].name);
  } else {
    console.log('No train matched directly.');
  }

  console.log('\n=== Test: whatsappSessionManager end-to-end ===');
  const phone = '+15551112222';

  // Step 1: Record Location
  await whatsappSessionManager.processIncomingMessage(
    phone,
    'Location (22.7105475, 88.386681)',
    undefined,
    { latitude: 22.7105475, longitude: 88.386681, name: 'Sodepur Pin' },
    '1282348971633521'
  );

  // Step 2: Send "Sealdah to dankuni"
  try {
    await whatsappSessionManager.processIncomingMessage(
      phone,
      'Sealdah to dankuni',
      undefined,
      undefined,
      '1282348971633521'
    );
    console.log('✅ End-to-End handleCatchTrainCalculation executed without error!');
  } catch (err) {
    console.error('❌ ERROR in handleCatchTrainCalculation:', err);
  }
}

testSealdahToDankuni();
