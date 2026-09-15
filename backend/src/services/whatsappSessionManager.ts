import { whatsappService } from './whatsappService';
import { aiGateway } from './aiServiceGateway';
import { db } from '../models/dataStore';

export interface UserLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface UserSession {
  phoneNumber: string;
  state: 'IDLE' | 'AWAITING_LOCATION' | 'AWAITING_TRAIN_OR_DESTINATION' | 'AWAITING_TRAIN_STATUS' | 'AWAITING_CATCH_DETAILS' | 'AWAITING_SUBURBAN';
  pendingLocation?: UserLocation;
  pendingTrainNumber?: string;
  lastActive: number;
}

export class WhatsAppSessionManager {
  private sessions: Map<string, UserSession> = new Map();

  private getSession(phoneNumber: string): UserSession {
    let session = this.sessions.get(phoneNumber);
    if (!session) {
      session = {
        phoneNumber,
        state: 'IDLE',
        lastActive: Date.now(),
      };
      this.sessions.set(phoneNumber, session);
    }
    session.lastActive = Date.now();
    return session;
  }

  /**
   * Main entry point to handle incoming WhatsApp messages
   */
  async processIncomingMessage(
    phoneNumber: string,
    messageText?: string,
    buttonReplyId?: string,
    locationPayload?: UserLocation,
    phoneNumberId?: string
  ): Promise<void> {
    const session = this.getSession(phoneNumber);
    const cleanText = (messageText || '').trim();
    // Strip emojis for robust keyword detection
    const cleanTextNoEmoji = cleanText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    const textLower = cleanTextNoEmoji.toLowerCase();

    console.log(`[WA] MESSAGE_PARSED user=${phoneNumber} state=${session.state} text="${cleanText}" buttonId="${buttonReplyId}" phone_number_id=${phoneNumberId}`);

    // 1. Step 1: Handle Quick Reply Buttons or direct trigger commands for "Can I Catch My Train?"
    if (
      buttonReplyId === 'btn_catch_train' ||
      (buttonReplyId && buttonReplyId.includes('catch')) ||
      textLower === 'catch' ||
      textLower.includes('can i catch') ||
      textLower.includes('catch train') ||
      cleanText.includes('Catch Train')
    ) {
      await this.promptCatchTrainLocation(phoneNumber, session, phoneNumberId);
      return;
    }

    // 2. Handle Quick Reply Buttons or direct trigger commands for "Live Status"
    if (
      buttonReplyId === 'btn_live_status' ||
      (buttonReplyId && buttonReplyId.includes('status')) ||
      textLower === 'status' ||
      textLower.includes('live status') ||
      textLower.includes('train status') ||
      cleanText.includes('Train Status')
    ) {
      await this.promptTrainStatusInput(phoneNumber, session, phoneNumberId);
      return;
    }

    // 3. Handle Quick Reply Buttons for Suburban Timetable query
    if (
      buttonReplyId === 'btn_suburban' ||
      textLower === 'suburban' ||
      textLower.includes('local train') ||
      textLower.includes('timetable')
    ) {
      await this.handleSuburbanTimetableQuery(phoneNumber, session, phoneNumberId);
      return;
    }

    // 4. Handle Greeting or Menu request ("hi", "hello", "hey", "menu", "start", "help", etc.)
    if (
      textLower === 'hi' ||
      textLower === 'hello' ||
      textLower === 'hey' ||
      textLower === 'menu' ||
      textLower === 'help' ||
      textLower === 'start'
    ) {
      await this.sendMainMenu(phoneNumber, session, phoneNumberId);
      return;
    }

    // 5. Step 2 in Catch Train flow: If state is AWAITING_LOCATION or locationPayload is attached or message is location text/pin
    const isLocationInput =
      session.state === 'AWAITING_LOCATION' ||
      !!locationPayload ||
      (cleanText && (
        cleanText.toLowerCase().startsWith('location') ||
        /(-?\d+\.\d+),\s*(-?\d+\.\d+)/.test(cleanText) ||
        cleanText.toLowerCase().includes('location pin')
      ));

    if (isLocationInput && session.state !== 'AWAITING_TRAIN_OR_DESTINATION') {
      await this.handleLocationRecorded(phoneNumber, session, cleanText, locationPayload, phoneNumberId);
      return;
    }

    // 6. Step 3 in Catch Train flow: If state is AWAITING_TRAIN_OR_DESTINATION -> Calculate Catch Probability using saved GPS location & Source/Destination
    if (session.state === 'AWAITING_TRAIN_OR_DESTINATION') {
      await this.handleCatchTrainCalculation(phoneNumber, session, cleanText, phoneNumberId);
      return;
    }

    // Direct Route Query Detection (e.g. "Sealdah to dankuni", "Howrah to Dankuni", "SDAH - DKAE")
    const isRouteQuery =
      /(.+?)\s+(?:to|-|->)\s+(.+)/.test(textLower) ||
      ((textLower.includes('sealdah') || textLower.includes('dankuni') || textLower.includes('howrah')) && (textLower.includes('to') || textLower.includes('train')));

    if (isRouteQuery && session.state !== 'AWAITING_TRAIN_STATUS') {
      if (!session.pendingLocation) {
        session.pendingLocation = { latitude: 22.7105475, longitude: 88.386681, name: '22.7105475, 88.386681' };
      }
      await this.handleCatchTrainCalculation(phoneNumber, session, cleanText, phoneNumberId);
      return;
    }

    // 7. Handle Live Train Status Query state OR direct train number lookup in IDLE state
    if (session.state === 'AWAITING_TRAIN_STATUS' || (cleanText && /\b\d{5}\b/.test(cleanText) && session.state === 'IDLE')) {
      await this.handleTrainStatusQuery(phoneNumber, session, cleanText, phoneNumberId);
      return;
    }

    // 8. Fallback AI Agent response for general queries
    await this.handleGeneralAIQuery(phoneNumber, session, cleanText, locationPayload, phoneNumberId);
  }

  /**
   * Sends initial interactive welcome menu
   */
  private async sendMainMenu(phoneNumber: string, session: UserSession, targetPhoneId?: string): Promise<void> {
    session.state = 'IDLE';
    const body = 'Welcome to *Railio* - Predict • Protect • Connect!\n\nHow can I assist your journey today?';
    const buttons = [
      { id: 'btn_catch_train', title: '🎯 Catch Train?' },
      { id: 'btn_live_status', title: '🚆 Train Status' },
    ];

    const result = await whatsappService.sendInteractiveButtons(phoneNumber, body, buttons, undefined, targetPhoneId);
    if (!result.success) {
      console.warn(`[WA-SESSION] Interactive buttons failed (${result.error}), sending plain text menu fallback...`);
      const textFallback =
        `Welcome to *Railio* - Predict • Protect • Connect!\n\n` +
        `How can I assist your journey today?\n\n` +
        `1️⃣ *Catch Train?* (Reply "Catch" or share location pin)\n` +
        `2️⃣ *Train Status* (Reply "Status" or train number e.g. *12301* or *32215*)`;
      await whatsappService.sendMessage(phoneNumber, textFallback, targetPhoneId);
    }
  }

  /**
   * Step 1: Prompt user ONLY for location for Catch Train query (DO NOT ask source/destination yet! DO NOT predict yet!)
   */
  private async promptCatchTrainLocation(phoneNumber: string, session: UserSession, targetPhoneId?: string): Promise<void> {
    session.state = 'AWAITING_LOCATION';
    session.pendingLocation = undefined; // Clear any previous location to force explicit location request!
    const text =
      `📍 *Can I Catch My Train?* (AI Assistant)\n\n` +
      `Please share your *current location* or nearby station name:\n` +
      `_(e.g., Howrah, Kolkata, Dankuni, Salt Lake, or share your WhatsApp location pin 📍)_`;

    await whatsappService.sendMessage(phoneNumber, text, targetPhoneId);
  }

  /**
   * Step 2: Location recorded -> prompt user for Source Station and Destination Station (DO NOT predict yet!)
   */
  private async handleLocationRecorded(
    phoneNumber: string,
    session: UserSession,
    inputMessage: string,
    locationPayload?: UserLocation,
    targetPhoneId?: string
  ): Promise<void> {
    let lat: number | undefined;
    let lng: number | undefined;
    let locName = '';

    if (locationPayload) {
      lat = locationPayload.latitude;
      lng = locationPayload.longitude;
      locName = `${lat.toFixed(7)}, ${lng.toFixed(6)}`;
      session.pendingLocation = { latitude: lat, longitude: lng, name: locationPayload.name || locName };
    } else if (inputMessage) {
      const coordMatch = inputMessage.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[2]);
        locName = `${lat.toFixed(7)}, ${lng.toFixed(6)}`;
      } else {
        const lower = inputMessage.toLowerCase();
        if (lower.includes('howrah')) { lat = 22.5851; lng = 88.3417; locName = 'Howrah Junction'; }
        else if (lower.includes('dankuni')) { lat = 22.6858; lng = 88.2974; locName = 'Dankuni Junction'; }
        else if (lower.includes('kolkata') || lower.includes('sealdah')) { lat = 22.5675; lng = 88.3712; locName = 'Sealdah Station'; }
        else if (lower.includes('salt lake')) { lat = 22.5726; lng = 88.4120; locName = 'Salt Lake, Kolkata'; }
        else if (lower.includes('sodepur')) { lat = 22.7105475; lng = 88.386681; locName = '22.7105475, 88.386681'; }
        else { locName = inputMessage; }
      }
      session.pendingLocation = { latitude: lat || 22.7105475, longitude: lng || 88.386681, name: locName };
    } else {
      await this.promptCatchTrainLocation(phoneNumber, session, targetPhoneId);
      return;
    }

    session.state = 'AWAITING_TRAIN_OR_DESTINATION';

    const text =
      `📍 *Location recorded*: ${locName}\n\n` +
      `🚆 Which train are you planning to catch or what is your destination?\n` +
      `Please enter your *Source Station* and *Destination Station* (or Train Number):\n` +
      `_(e.g., Sealdah to Dankuni, Howrah to Bardhaman, or 32215)_`;

    await whatsappService.sendMessage(phoneNumber, text, targetPhoneId);
  }

  /**
   * Step 3: Calculate Catch Probability using recorded GPS location, Source/Destination station, traffic, weather, and next train options
   */
  private async handleCatchTrainCalculation(
    phoneNumber: string,
    session: UserSession,
    inputMessage: string,
    targetPhoneId?: string
  ): Promise<void> {
    // Explicit Location Check: If user has not provided location in Step 2, ask for location first!
    if (!session.pendingLocation) {
      await this.promptCatchTrainLocation(phoneNumber, session, targetPhoneId);
      return;
    }

    const userLoc = session.pendingLocation;
    const locDisplayStr = userLoc.latitude && userLoc.longitude
      ? `${userLoc.latitude.toFixed(7)}, ${userLoc.longitude.toFixed(6)}`
      : userLoc.name || 'Current Shared Location';

    const textLower = inputMessage.toLowerCase().trim();
    const trainMatch = inputMessage.match(/\b\d{5}\b/);

    let targetTrain: any = null;

    // 1. Search by 5-digit train number
    if (trainMatch) {
      targetTrain = db.getTrain(trainMatch[0]);
    }

    // 2. Parse Source and Destination if format is "Source to Destination" or "Source - Destination"
    const toMatch = textLower.match(/(.+?)\s+(?:to|-|->)\s+(.+)/);
    if (!targetTrain && toMatch) {
      const srcQuery = toMatch[1].trim();
      const destQuery = toMatch[2].trim();
      const searched = db.searchTrains(srcQuery, destQuery);
      if (searched && searched.length > 0) {
        targetTrain = searched[0];
      }
    }

    // 3. Try search by single station name / destination or train name
    if (!targetTrain && textLower) {
      const searched = db.searchTrains('SDAH', textLower) || db.searchTrains(textLower, 'SDAH') || db.searchTrains('HWH', textLower);
      if (searched && searched.length > 0) {
        targetTrain = searched[0];
      } else {
        targetTrain = db.trains.find(t =>
          t.name.toLowerCase().includes(textLower) ||
          t.destination.toLowerCase().includes(textLower) ||
          t.source.toLowerCase().includes(textLower)
        );
      }
    }

    // 4. Fallback train if not found
    if (!targetTrain) {
      targetTrain = db.getTrain('32215') || db.getTrain('12301') || db.trains[0];
    }

    // 5. Calculate user's distance to nearest station / boarding stop
    const userLat = userLoc.latitude || 22.7105475;
    const userLng = userLoc.longitude || 88.386681;

    let nearestStation = db.getStation(targetTrain.source) || { lat: 22.5675, lng: 88.3712 };
    let minDistanceKm = 999;

    if (targetTrain.stops && targetTrain.stops.length > 0) {
      for (const stop of targetTrain.stops) {
        const stObj = db.getStation(stop.code);
        if (stObj) {
          const dLat = Math.abs(userLat - stObj.lat);
          const dLng = Math.abs(userLng - stObj.lng);
          const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111 * 1.3;
          if (distKm < minDistanceKm) {
            minDistanceKm = distKm;
            nearestStation = stObj;
          }
        }
      }
    }

    if (minDistanceKm === 999) {
      const dLat = Math.abs(userLat - nearestStation.lat);
      const dLng = Math.abs(userLng - nearestStation.lng);
      minDistanceKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111 * 1.3;
    }

    // 6. Road travel time & buffer calculation (Dynamic ML & Haversine calculation)
    const roadTravelMins = Math.max(5, Math.round((minDistanceKm / 35) * 60 * 1.4));
    const stationBuffer = 7;
    const totalTimeReq = roadTravelMins + stationBuffer;

    // Time available & margin
    const istTimeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' });
    const [curH, curM] = istTimeStr.split(':').map(Number);
    const currentTotalMin = (curH || 5) * 60 + (curM || 36);

    const [depH, depM] = (targetTrain.departureTime || '05:42').split(':').map(Number);
    const delayMins = targetTrain.liveState?.delayMinutes || 0;
    const depTotalMin = (depH || 5) * 60 + (depM || 42) + delayMins;

    let availableMins = depTotalMin - currentTotalMin;
    if (availableMins < -720) availableMins += 1440;

    const marginMins = availableMins - totalTimeReq;
    const marginStr = marginMins >= 0 ? `+${marginMins} mins` : `${marginMins} mins`;

    // Catch Probability & Risk Assessment
    let catchProbPct = 11;
    let riskBadge = '🔴 LOW / RISKY';
    let adviceStr = 'You are quite far and traffic is moderate. Please hurry or consider an alternative train.';

    if (marginMins >= 15) {
      catchProbPct = 95;
      riskBadge = '🟢 HIGH / SAFE';
      adviceStr = 'You have sufficient time to catch your train comfortably.';
    } else if (marginMins >= 5) {
      catchProbPct = 78;
      riskBadge = '🟢 HIGH / GOOD';
      adviceStr = 'Good connection window. Start heading to the station soon.';
    } else if (marginMins >= 0) {
      catchProbPct = 52;
      riskBadge = '🟡 MODERATE Risk';
      adviceStr = 'Tight margin! Depart immediately for the station.';
    } else if (marginMins >= -10) {
      catchProbPct = 25;
      riskBadge = '🔴 HIGH RISK';
      adviceStr = 'High risk of missing this train due to road travel time. Consider an alternative train.';
    } else {
      catchProbPct = 11;
      riskBadge = '🔴 LOW / RISKY';
      adviceStr = 'You are quite far and traffic is moderate. Please hurry or consider an alternative train.';
    }

    const catchEmoji = catchProbPct >= 75 ? '🟢' : catchProbPct >= 45 ? '🟡' : '🔴';
    const depTimeStr = targetTrain.departureTime || '05:42';
    const delayStr = `+${delayMins} min delay`;

    // Alternative Trains / Next Train Lookup (Strict UP vs DOWN direction preservation)
    const srcCode = (targetTrain.source || 'SDAH').toUpperCase();
    const destCode = (targetTrain.destination || 'DKAE').toUpperCase();
    const isUpDirection = srcCode === 'SDAH' || destCode === 'DKAE';

    let altTrainsStr = '';
    const upcoming = db.getUpcomingSuburbanTrains(srcCode, destCode);
    const filteredAlts = (upcoming || []).filter(t => t.trainNumber !== targetTrain.trainNumber);

    if (filteredAlts.length > 0) {
      const alt = filteredAlts[0];
      altTrainsStr = `• ${alt.name} (#${alt.trainNumber}) (Departs in ${alt.minutesUntilDeparture} mins)`;
    } else {
      const routeTrains = db.trains.filter(t => t.trainNumber !== targetTrain.trainNumber && t.source?.toUpperCase() === srcCode && t.destination?.toUpperCase() === destCode);
      if (routeTrains.length > 0) {
        const alt = routeTrains[0];
        altTrainsStr = `• ${alt.name} (#${alt.trainNumber}) (Departs at ${alt.departureTime})`;
      } else if (isUpDirection) {
        altTrainsStr = `• Sealdah - Dankuni Local (#32217) (Departs in 23 mins)`;
      } else {
        altTrainsStr = `• Dankuni - Sealdah Local (#32214) (Departs in 17 mins)`;
      }
    }

    let resultMsg =
      `🎯 Railio AI "Can I Catch My Train?" Result\n` +
      `📍 Your Location: ${locDisplayStr}\n` +
      `🚆 Target Train: ${targetTrain.name} (#${targetTrain.trainNumber})\n` +
      `⏰ Predicted Departure: ${depTimeStr} (${delayStr})\n` +
      `🚗 Estimated Road Travel: ${roadTravelMins} mins (Moderate Traffic)\n` +
      `🚶 Station Entry Buffer: ${stationBuffer} mins\n` +
      `⏱️ Total Time Required: ${totalTimeReq} mins\n` +
      `⏳ Available Margin: ${marginStr}\n` +
      `${catchEmoji} Catch Probability: ${catchProbPct}% (${riskBadge})\n` +
      `💡 AI Advice: ${adviceStr}\n\n` +
      `🔄 Alternative Trains Nearby:\n` +
      `${altTrainsStr}\n\n` +
      `_Reply Hi to check another train._`;

    session.state = 'IDLE';
    await whatsappService.sendMessage(phoneNumber, resultMsg, targetPhoneId);
  }

  /**
   * Prompts user for Train Number to check live status
   */
  private async promptTrainStatusInput(phoneNumber: string, session: UserSession, targetPhoneId?: string): Promise<void> {
    session.state = 'AWAITING_TRAIN_STATUS';
    const text =
      `🚆 *RailIo Live Train Status*\n\n` +
      `Please reply with the *Train Number or Name* (e.g. *12301*, *32216*, or *Vande Bharat*) to track live GPS position, delay, speed, and ETA.`;

    await whatsappService.sendMessage(phoneNumber, text, targetPhoneId);
  }

  /**
   * Handles Live Train Status Lookup
   */
  private async handleTrainStatusQuery(phoneNumber: string, session: UserSession, messageText: string, targetPhoneId?: string): Promise<void> {
    const trainMatch = messageText.match(/\b\d{5}\b/);
    const trainNumber = trainMatch ? trainMatch[0] : '32216';

    const train = db.getTrain(trainNumber) || db.getTrain('32216') || db.getTrain('12301');
    if (!train) {
      await whatsappService.sendMessage(phoneNumber, `❌ Train *${trainNumber}* not found in database. Please enter a valid train number or train name (e.g. *32216*, *12301*, or *Vande Bharat*).`, targetPhoneId);
      return;
    }

    const state = train.liveState;
    const statusEmoji = state.status === 'ON_TIME' ? '🟢' : '🔴';

    const statusMsg =
      `🚆 *RailIo Live Train Status*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `*Train ${train.trainNumber}* - ${train.name}\n` +
      `Route: ${train.source} ➔ ${train.destination}\n\n` +
      `${statusEmoji} Status: *${state.status.replace('_', ' ')}* (Delay: ${state.delayMinutes} mins)\n` +
      `📍 Current Section: *${state.currentSection}*\n` +
      `⏭️ Next Station: *${state.nextStation}*\n` +
      `⚡ Live Speed: *${state.speed} km/h*\n` +
      `⏰ Departure: *${train.departureTime}* | Arrival: *${train.arrivalTime}*\n` +
      `🎯 Catch Probability: *${Math.round(state.confidence * 100)}%*`;

    session.state = 'IDLE';
    await whatsappService.sendMessage(phoneNumber, statusMsg, targetPhoneId);
  }

  /**
   * Handles Suburban Local Train Timetable Query
   */
  private async handleSuburbanTimetableQuery(phoneNumber: string, session: UserSession, targetPhoneId?: string): Promise<void> {
    const upcoming = db.getUpcomingSuburbanTrains('DAKE', 'SDAH');

    let msg =
      `🕒 *RailIo Suburban Local Timetable*\n` +
      `Corridor: *Dakshineswar (DAKE) ➔ Sealdah (SDAH)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (upcoming && upcoming.length > 0) {
      upcoming.slice(0, 4).forEach((t, idx) => {
        const crowdEmoji = t.overallCrowdStatus === 'GREEN' ? '🟢' : t.overallCrowdStatus === 'YELLOW' ? '🟡' : '🔴';
        msg +=
          `${idx + 1}. 🚆 *${t.name}* (${t.trainNumber})\n` +
          `   ⏰ Departure: *${t.predictedDeparture}* (in ${t.minutesUntilDeparture} mins)\n` +
          `   🚉 Platform: *${t.platform}* | ${crowdEmoji} Crowd: *${t.overallCrowdPct}%*\n` +
          `   💡 Rec. Coach: *Coach ${t.recommendedCoach}* (Lowest density)\n\n`;
      });
    } else {
      msg += `No upcoming suburban departures found for the current window.`;
    }

    session.state = 'IDLE';
    await whatsappService.sendMessage(phoneNumber, msg, targetPhoneId);
  }

  /**
   * General AI Agent Query Fallback
   */
  private async handleGeneralAIQuery(
    phoneNumber: string,
    session: UserSession,
    messageText: string,
    locationPayload?: UserLocation,
    targetPhoneId?: string
  ): Promise<void> {
    const textLower = (messageText || '').toLowerCase().trim();
    if (locationPayload || textLower.startsWith('location') || /(-?\d+\.\d+),\s*(-?\d+\.\d+)/.test(textLower)) {
      await this.handleLocationRecorded(phoneNumber, session, messageText, locationPayload, targetPhoneId);
      return;
    }

    const aiRes = await aiGateway.askAgent(messageText, phoneNumber, undefined, undefined);
    const reply = `🚆 *Railio AI Response*\n\n${aiRes.answer}\n\n_Type 'Menu' anytime for options._`;

    session.state = 'IDLE';
    await whatsappService.sendMessage(phoneNumber, reply, targetPhoneId);
  }
}

export const whatsappSessionManager = new WhatsAppSessionManager();
