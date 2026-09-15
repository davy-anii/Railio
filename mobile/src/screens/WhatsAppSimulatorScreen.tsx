import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { AppBackground } from '../components/AppBackground';

export const WhatsAppSimulatorScreen: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([
    {
      id: '1',
      sender: 'user',
      text: 'Can I catch my train 32216 from Dakshineswar to Sealdah?',
      time: '06:30',
    },
    {
      id: '2',
      sender: 'bot',
      text:
        `🎯 Railio AI "Can I Catch My Train?" Result\n` +
        `📍 Your Location: 22.7105475, 88.386681\n` +
        `🚆 Target Train: Dankuni - Sealdah Local (#32216)\n` +
        `⏰ Predicted Departure: 06:34 (+3 min delay)\n` +
        `🚗 Estimated Road Travel: 5 mins (Moderate Traffic)\n` +
        `🚶 Station Entry Buffer: 4 mins\n` +
        `⏱️ Total Time Required: 9 mins\n` +
        `⏳ Available Margin: +14 mins\n` +
        `🟢 Catch Probability: 92% (🟢 HIGH / SAFE)\n` +
        `💡 AI Advice: High probability you can catch your train. Board at Platform 2, Coach C3/C9 (Lowest crowd density).\n\n` +
        `🔄 Alternative Trains Nearby:\n` +
        `• Sealdah - Dankuni Local (#32217) (Departs in 23 mins)\n\n` +
        `_Reply Hi to check another train._`,
      time: '06:30',
    },
  ]);

  const handleSend = () => {
    if (!input.trim()) return;
    const textLower = input.toLowerCase().trim();
    const userMsg = { id: Date.now().toString(), sender: 'user', text: input, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    
    let botReplyText = '';
    if (textLower === 'hi' || textLower === 'hello' || textLower === 'hey' || textLower === 'menu' || textLower === 'start') {
      botReplyText =
        `🚆 *RailIo AI Railway Assistant*\n\n` +
        `Welcome to *RailIo* - Predict • Protect • Connect!\n\n` +
        `How can I assist your journey today?\n\n` +
        `1️⃣ *Can I Catch My Train?* (Reply "1" or "Catch")\n` +
        `2️⃣ *Live Train Status* (Reply "2" or "Status")\n` +
        `3️⃣ *Suburban Local Timetable* (Reply "3" or "Suburban")`;
    } else if (textLower === '1' || textLower.includes('catch') || textLower.includes('can i catch')) {
      botReplyText =
        `🎯 Railio AI "Can I Catch My Train?" Result\n` +
        `📍 Your Location: 22.7105475, 88.386681\n` +
        `🚆 Target Train: Dankuni - Sealdah Local (#32216)\n` +
        `⏰ Predicted Departure: 06:34 (+3 min delay)\n` +
        `🚗 Estimated Road Travel: 5 mins (Moderate Traffic)\n` +
        `🚶 Station Entry Buffer: 4 mins\n` +
        `⏱️ Total Time Required: 9 mins\n` +
        `⏳ Available Margin: +14 mins\n` +
        `🟢 Catch Probability: 92% (🟢 HIGH / SAFE)\n` +
        `💡 AI Advice: High probability you can catch your train. Board at Platform 2, Coach C3/C9 (Lowest crowd density).\n\n` +
        `🔄 Alternative Trains Nearby:\n` +
        `• Sealdah - Dankuni Local (#32217) (Departs in 23 mins)\n\n` +
        `_Reply Hi to check another train._`;
    } else if (textLower === '2' || textLower.includes('status') || textLower.includes('live')) {
      botReplyText =
        `🚆 *RailIo Live Train Status*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Train 32216* - Dankuni - Sealdah Local\n` +
        `Route: Dankuni ➔ Sealdah\n\n` +
        `🟢 Status: *ON TIME* (Delay: +3 mins)\n` +
        `📍 Current Section: *Dakshineswar (DAKE) approach*\n` +
        `⏭️ Next Station: *Baranagar Road (BARN)*\n` +
        `⚡ Live Speed: *48 km/h*\n` +
        `🎯 Catch Probability: *92%*`;
    } else {
      botReplyText =
        `🚆 *RailIo Passenger Assistant*\n\n` +
        `Checked live signals for "${input}".\n\n` +
        `• Train 32216 Dankuni - Sealdah Local is on schedule (+3m delay).\n` +
        `• Coach C3/C9 has the lowest device density (~16 phone signals).\n` +
        `• ML Model estimates ETA at Sealdah at 07:21.`;
    }

    const botMsg = {
      id: (Date.now() + 1).toString(),
      sender: 'bot',
      text: botReplyText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput('');
  };

  return (
    <AppBackground variant="orange">
      <View style={styles.container}>
      {/* WhatsApp Header Mockup */}
      <View style={styles.waHeader}>
        <View style={styles.avatar}>
          <Text style={{ fontSize: 18 }}>🚆</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>RailIo AI Passenger Sathi (+1 555 678 3260)</Text>
          <Text style={styles.headerStatus}>Verified Indian Railways Passenger Bot</Text>
        </View>
      </View>

      {/* Chat Messages */}
      <ScrollView style={styles.chatArea} contentContainerStyle={styles.chatContent}>
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <View key={m.id} style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
              <Text style={[styles.bubbleText, isUser ? styles.textUser : styles.textBot]}>
                {m.text}
              </Text>
              <Text style={styles.msgTime}>{m.time}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message RailIo on WhatsApp..."
          placeholderTextColor="#64748B"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendBtnText}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  waHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  headerStatus: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    gap: 12,
  },
  bubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#D9FDD3',
    borderBottomRightRadius: 2,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  bubbleBot: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bubbleText: {
    fontSize: 12,
    lineHeight: 18,
  },
  textUser: {
    color: '#0F172A',
  },
  textBot: {
    color: '#0F172A',
  },
  msgTime: {
    fontSize: 8.5,
    color: '#64748B',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#0F172A',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
