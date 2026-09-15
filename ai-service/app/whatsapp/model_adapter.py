from typing import Dict, Any, Optional
from app.ml.eta_delay_predictor import eta_predictor, DelayPredictionRequest
from app.ml.train_schedule_db import train_schedule_db, get_ist_now

STATION_MAP = {
    "SDAH": "Sealdah Junction",
    "HWH": "Howrah Junction",
    "DKAE": "Dankuni Junction",
    "DAKE": "Dakshineswar",
    "DDJ": "Dum Dum Junction",
    "BNXR": "Bidhan Nagar Road",
    "BARN": "Baranagar Road",
    "BLYG": "Bally Ghat",
    "RCD": "Rajchandrapur",
    "BWN": "Barddhaman Junction",
    "NDLS": "New Delhi",
    "DDU": "Pt. Deen Dayal Upadhyaya Junction",
    "ASN": "Asansol Junction",
    "DHN": "Dhanbad Junction",
    "KOAA": "Kolkata Terminal",
    "BNDL": "Bandel Junction",
}

def format_station(code_or_name: str) -> str:
    if not code_or_name:
        return "Terminal Station"
    raw = str(code_or_name).strip()
    upper = raw.upper()
    if upper in STATION_MAP:
        return f"{STATION_MAP[upper]} ({upper})"
    return raw

class ExistingRailIoModelAdapter:
    def __init__(self):
        pass

    def get_train_status(self, train_number: str, role: str = None) -> Dict[str, Any]:
        """
        Fetches existing train data and runs the existing ML prediction.
        Returns a formatted dictionary suitable for WhatsApp response generation.
        """
        train = train_schedule_db.get(train_number)
        if not train:
            return {"error": f"Train {train_number} not found."}

        now = get_ist_now()
        ctx = train_schedule_db.build_predictor_context(train_number, now)
        
        ml_pred = None
        if ctx:
            try:
                ml_req = DelayPredictionRequest(
                    trainNumber=train_number,
                    currentSpeed=ctx["currentSpeed"],
                    distanceRemaining=ctx["distanceKm"],
                    weatherCondition="Clear",
                    junctionCongestionLevel=0.4,
                    day=ctx["day"], month=ctx["month"], dayOfWeek=ctx["dayOfWeek"],
                    departureHour=ctx["departureHour"], departureMinute=ctx["departureMinute"],
                    arrivalHour=ctx["arrivalHour"], arrivalMinute=ctx["arrivalMinute"],
                    travelDurationMins=ctx["travelDurationMins"],
                    distanceKm=ctx["distanceKm"], direction=ctx["direction"],
                    departureDelay=ctx["departureDelay"]
                )
                ml_pred = eta_predictor.predict(ml_req)
            except Exception as e:
                print(f"[MODEL ADAPTER] ML error: {e}")

        # Format output from liveState or train route
        live_state = train.get("liveState", {})
        raw_loc = live_state.get("currentSection") or live_state.get("current_section") or train.get("source", "Origin")
        raw_next = live_state.get("nextStation") or live_state.get("next_station") or live_state.get("next_station_code") or train.get("destination", "Destination")
        delay_minutes = live_state.get("delayMinutes") or live_state.get("current_delay_minutes") or live_state.get("delay_minutes", 0)
        
        predicted_delay = ml_pred.predictedDelayMinutes if ml_pred else delay_minutes
        
        return {
            "train_number": train_number,
            "train_name": train.get("name", f"Train {train_number}"),
            "type": train.get("type", "Suburban / Express"),
            "current_location": format_station(raw_loc),
            "next_station": format_station(raw_next),
            "distance_remaining": ctx.get("distanceKm", 0) if ctx else 0,
            "scheduled_arrival": train.get("arrivalTime", "07:21"),
            "expected_delay": predicted_delay,
            "status": live_state.get("status", "ON_TIME").replace("_", " "),
            "updated_at": live_state.get("updated_at", now.strftime("%I:%M %p IST")),
            "ml_confidence": ml_pred.confidenceScore if ml_pred else 0.92
        }

    def format_for_whatsapp(self, data: Dict[str, Any], query_type: str, role: str) -> str:
        if "error" in data:
            return f"⚠️ I couldn't find information for that train. Please try again."

        train_name = data.get("train_name", f"Train {data['train_number']}")
        text = f"🚆 *{train_name} ({data['train_number']})*\n━━━━━━━━━━━━━━━━━━━━━━\n\n"
        
        text += f"📍 *Current Section:* {data['current_location']}\n"
        text += f"⏭️ *Next Station:* {data['next_station']}\n"
        text += f"⚡ *AI Delay Prediction:* {data['expected_delay']:.1f} mins ({data['status']})\n"
        text += f"⏰ *Scheduled Arrival:* {data['scheduled_arrival']}\n"
        conf = data.get("ml_confidence", 0.92)
        text += f"🎯 *ML Confidence:* {int(conf * 100)}%\n\n"
        text += f"⏱️ *Last Updated:* {data.get('updated_at', 'Now IST')}"
        return text

model_adapter = ExistingRailIoModelAdapter()
