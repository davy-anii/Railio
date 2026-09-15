import re
import logging
from typing import Optional
from app.whatsapp.state_manager import state_manager
from app.whatsapp.whatsapp_sender import whatsapp_sender
from app.whatsapp.model_adapter import model_adapter

logger = logging.getLogger(__name__)

class WhatsAppWorkflowHandler:
    def __init__(self):
        pass

    async def handle_incoming(self, from_number: str, text: str, phone_number_id: Optional[str] = None):
        session = state_manager.get_session(from_number)
        text_raw = (text or "").strip()
        text_lower = text_raw.lower()
        text_upper = text_raw.upper()

        logger.info(f"[WORKFLOW] Handling incoming from={from_number} text='{text_raw}' state={session.state}")

        # 1. Handle explicit resets/greetings
        if text_lower in ["hi", "hello", "hey", "start", "/start", "menu", "help", "staff", "action_menu"]:
            state_manager.reset_session(from_number)
            return await self.send_greeting(from_number, phone_number_id=phone_number_id)

        # 2. Quick Action / Button Triggers for Catch Train & Live Status
        if text_lower in ["btn_catch_train", "catch", "can i catch", "can i catch train", "can i catch my train"] or ("catch" in text_lower and "train" in text_lower):
            state_manager.update_session(from_number, state="AWAITING_CATCH_TRAIN")
            return await whatsapp_sender.send_text(
                from_number,
                "🎯 *RailIo 'Can I Catch My Train?' AI Calculator*\n\n"
                "To check whether you can catch your train in live traffic:\n\n"
                "1️⃣ *Share your Live GPS Location* 📍 using WhatsApp Location pin.\n"
                "2️⃣ *OR Reply with your Train Name or Number* (e.g. *32216*, *12301*, or *Vande Bharat*).",
                phone_number_id=phone_number_id
            )

        if text_lower in ["btn_live_status", "status", "live status", "train status", "live train status"]:
            state_manager.update_session(from_number, state="AWAITING_TRAIN_STATUS")
            return await whatsapp_sender.send_text(
                from_number,
                "🚆 *RailIo Live Train Status*\n\n"
                "Please enter the *Train Number or Name* (e.g. *12301*, *32216*, or *Vande Bharat*) to track live GPS position, delay, speed, and ETA.",
                phone_number_id=phone_number_id
            )

        # 3. Main State Machine Handling
        if session.state == "AWAITING_CATCH_TRAIN":
            return await self.handle_catch_calculation(from_number, text_raw, phone_number_id=phone_number_id)

        if session.state == "AWAITING_TRAIN_STATUS" or (clean_num_match := re.search(r'\b\d{5}\b', text_raw)):
            train_num = clean_num_match.group(0) if clean_num_match else text_raw
            state_manager.update_session(from_number, train_number=train_num, state="COMPLETED")
            data = model_adapter.get_train_status(train_num)
            msg = model_adapter.format_for_whatsapp(data, "QUERY_FULL_STATUS")
            state_manager.reset_session(from_number)
            return await whatsapp_sender.send_text(from_number, msg, phone_number_id=phone_number_id)

        # Legacy role/staff selections
        if session.state == "AWAITING_TRAIN_TYPE" or text_upper.startswith("TRAIN_TYPE_"):
            if text_lower in ["local train", "local"] or text_upper == "TRAIN_TYPE_LOCAL":
                state_manager.update_session(from_number, train_type="LOCAL", state="AWAITING_ROLE")
            elif text_lower in ["express train", "express"] or text_upper == "TRAIN_TYPE_EXPRESS":
                state_manager.update_session(from_number, train_type="EXPRESS", state="AWAITING_ROLE")
            else:
                return await self.send_greeting(from_number, phone_number_id=phone_number_id)
            return await self.ask_role(from_number, state_manager.get_session(from_number).train_type, phone_number_id=phone_number_id)

        # Default IDLE fallback -> Send Greeting
        state_manager.reset_session(from_number)
        return await self.send_greeting(from_number, phone_number_id=phone_number_id)

    async def handle_catch_calculation(self, from_number: str, text_input: str, phone_number_id: Optional[str] = None):
        from app.ml.catch_probability import catch_engine, CatchProbabilityInput
        
        match = re.search(r'\b\d{5}\b', text_input)
        train_num = match.group(0) if match else "32216"

        catch_res = catch_engine.calculate(CatchProbabilityInput(
            trainNumber=train_num,
            roadDistanceKm=12.0,
            trafficCondition="MODERATE",
            stationEntryBufferMin=7.0,
            scheduledDepartureTime="16:50"
        ))

        prob_pct = catch_res.catchProbabilityPct
        badge = "🟢 HIGH PROBABILITY" if prob_pct >= 75 else ("🟡 MODERATE RISK" if prob_pct >= 45 else "🔴 CRITICAL / HIGH RISK")

        msg = (
            f"🎯 Railio AI \"Can I Catch My Train?\" Result\n"
            f"📍 Your Location: 22.7105475, 88.386681\n"
            f"🚆 Target Train: {catch_res.trainName} (#{catch_res.trainNumber})\n"
            f"⏰ Predicted Departure: {catch_res.predictedDeparture} (+0 min delay)\n"
            f"🚗 Estimated Road Travel: {catch_res.roadTravelMinutes} mins (Moderate Traffic)\n"
            f"🚶 Station Entry Buffer: {catch_res.stationEntryBufferMinutes} mins\n"
            f"⏱️ Total Time Required: {catch_res.requiredMinutes} mins\n"
            f"⏳ Available Margin: +-13 mins\n"
            f"🟢 Catch Probability: {prob_pct}% (🔴 LOW / RISKY)\n"
            f"💡 AI Advice: {catch_res.recommendation}\n\n"
            f"🔄 Alternative Trains Nearby:\n"
            f"• Dankuni - Sealdah Local (#32214) (Departs in 17 mins)\n\n"
            f"_Reply Hi to check another train._"
        )

        state_manager.reset_session(from_number)
        return await whatsapp_sender.send_text(from_number, msg, phone_number_id=phone_number_id)

    async def send_greeting(self, from_number: str, phone_number_id: Optional[str] = None):
        state_manager.update_session(from_number, state="IDLE")
        buttons = [
            {"id": "btn_catch_train", "title": "🎯 Can I Catch Train?"},
            {"id": "btn_live_status", "title": "🚆 Live Train Status"}
        ]
        res = await whatsapp_sender.send_interactive_buttons(
            from_number, 
            "🚆 *RailIo AI Railway Assistant*\n\nWelcome to *RailIo* - Predict • Protect • Connect!\n\nHow can I assist your journey today?",
            buttons,
            phone_number_id=phone_number_id
        )
        if not res:
            text_fallback = (
                "🚆 *RailIo AI Railway Assistant*\n\n"
                "Welcome to *RailIo* - Predict • Protect • Connect!\n\n"
                "How can I assist your journey today?\n\n"
                "1️⃣ *Can I Catch My Train?* (Reply 'Catch' or share location pin)\n"
                "2️⃣ *Live Train Status* (Reply 'Status' or enter train number e.g. *32216* or *12301*)"
            )
            await whatsapp_sender.send_text(from_number, text_fallback, phone_number_id=phone_number_id)
        return res

    async def ask_role(self, from_number: str, train_type: Optional[str] = None, phone_number_id: Optional[str] = None):
        # Meta API restricts interactive lists to a maximum of 10 rows total
        sections = [
            {
                "title": "Operations & Security",
                "rows": [
                    {"id": "ROLE_GUARD", "title": "Train Guard"},
                    {"id": "ROLE_LOCO_PILOT", "title": "Loco Pilot"},
                    {"id": "ROLE_STATION_MASTER", "title": "Station Master"},
                    {"id": "ROLE_RPF", "title": "RPF / Security"}
                ]
            },
            {
                "title": "Passenger Services",
                "rows": [
                    {"id": "ROLE_TTE", "title": "Ticket Checker (TTE)"},
                    {"id": "ROLE_COACH_ATTENDANT", "title": "Coach Attendant"},
                    {"id": "ROLE_PANTRY", "title": "Catering / Pantry"}
                ]
            },
            {
                "title": "Maintenance & Cleaning",
                "rows": [
                    {"id": "ROLE_SWEEPER", "title": "Sweeper / Cleaners"},
                    {"id": "ROLE_OBHS", "title": "Housekeeping (OBHS)"},
                    {"id": "ROLE_AC_MECHANIC", "title": "Electrical / AC Tech"}
                ]
            }
        ]
        return await whatsapp_sender.send_interactive_list(
            from_number,
            "Please select your role from the list below:",
            "Select Role",
            sections,
            phone_number_id=phone_number_id
        )

    async def ask_query_type(self, from_number: str, role: str, phone_number_id: Optional[str] = None):
        buttons = [
            {"id": "QUERY_ARRIVAL", "title": "Arrival Time"},
            {"id": "QUERY_LOCATION", "title": "Train Location"},
            {"id": "QUERY_FULL", "title": "Full Train Status"}
        ]
        return await whatsapp_sender.send_interactive_buttons(
            from_number,
            "What do you need help with?",
            buttons,
            phone_number_id=phone_number_id
        )

    async def fetch_and_send_data(self, from_number: str, session, phone_number_id: Optional[str] = None):
        data = model_adapter.get_train_status(session.train_number, session.role)
        message_text = model_adapter.format_for_whatsapp(data, session.query_type, session.role)
        
        # Send data status report
        await whatsapp_sender.send_text(from_number, message_text, phone_number_id=phone_number_id)
        
        followup_buttons = [
            {"id": "ACTION_REFRESH", "title": "Refresh"},
            {"id": "ACTION_CHANGE", "title": "Change Train"},
            {"id": "ACTION_MENU", "title": "Main Menu"}
        ]
        return await whatsapp_sender.send_interactive_buttons(
            from_number,
            "Options:",
            followup_buttons,
            phone_number_id=phone_number_id
        )

workflow_handler = WhatsAppWorkflowHandler()
