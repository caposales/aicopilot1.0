"""Cal.com API Service for booking appointments"""
import os
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# Timezone offset mapping (hours from UTC)
TIMEZONE_OFFSETS = {
    "America/Los_Angeles": -7,  # PDT
    "America/Denver": -6,       # MDT
    "America/Chicago": -5,      # CDT
    "America/New_York": -4,     # EDT
    "America/Phoenix": -7,      # MST (no DST)
    "Europe/London": 1,         # BST
    "Europe/Paris": 2,          # CEST
    "Asia/Tokyo": 9,
    "Australia/Sydney": 10,
}

class CalComService:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.cal.com/v2"
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "cal-api-version": "2024-09-04"
        }
        self.user_timezone = "America/Los_Angeles"  # Default, will be fetched
    
    async def get_user_timezone(self) -> str:
        """Fetch the user's timezone from Cal.com"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/me",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "cal-api-version": "2024-06-14"
                    },
                    timeout=10
                )
                if response.status_code == 200:
                    data = response.json()
                    tz = data.get("data", {}).get("timeZone", "America/Los_Angeles")
                    self.user_timezone = tz
                    logger.info(f"User timezone: {tz}")
                    return tz
        except Exception as e:
            logger.error(f"Error getting user timezone: {e}")
        return self.user_timezone
    
    def get_utc_offset(self) -> int:
        """Get UTC offset hours for user's timezone"""
        return TIMEZONE_OFFSETS.get(self.user_timezone, -7)  # Default to Pacific
    
    async def get_event_types(self) -> List[Dict[str, Any]]:
        """Get all event types for the user"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/event-types",
                    headers=self.headers,
                    timeout=10
                )
                response.raise_for_status()
                data = response.json()
                logger.info(f"Event types response: {data}")
                return data.get("data", [])
        except Exception as e:
            logger.error(f"Error getting event types: {e}")
            return []
    
    async def get_slots(
        self,
        event_type_id: int,
        start_date: str,
        end_date: str,
        timezone: str = "America/Los_Angeles"
    ) -> Dict[str, Any]:
        """Get available time slots using v2 API"""
        try:
            # Use the working endpoint format
            start_iso = f"{start_date}T00:00:00Z"
            end_iso = f"{end_date}T00:00:00Z"
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/slots/available",
                    params={
                        "eventTypeId": event_type_id,
                        "startTime": start_iso,
                        "endTime": end_iso
                    },
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "cal-api-version": "2024-06-14"
                    },
                    timeout=10
                )
                logger.info(f"Slots API response: {response.status_code}")
                if response.status_code == 200:
                    data = response.json()
                    return data
                else:
                    logger.error(f"Slots API error: {response.status_code} - {response.text}")
                    return {"data": {"slots": {}}}
        except Exception as e:
            logger.error(f"Error getting slots: {e}")
            return {"data": {"slots": {}}}
    
    async def create_booking(
        self,
        event_type_id: int,
        start_time: str,
        name: str,
        email: str,
        timezone: str = "America/Los_Angeles",
        notes: str = ""
    ) -> Dict[str, Any]:
        """Create a new booking using v2 API"""
        try:
            # Calculate end time (30 min default)
            from datetime import datetime, timedelta
            
            # Parse the start time (it's already in UTC with Z)
            start_dt = datetime.fromisoformat(start_time.replace("Z", "").replace(".000", ""))
            end_dt = start_dt + timedelta(minutes=30)
            
            # Send WITH Z - times are in UTC
            payload = {
                "eventTypeId": event_type_id,
                "start": start_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "end": end_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "timeZone": timezone,
                "language": "en",
                "metadata": {},
                "responses": {
                    "name": name,
                    "email": email,
                    "notes": notes if notes else "Booked via voice assistant"
                }
            }
            
            logger.info(f"Creating booking with payload: {payload}")
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/bookings",
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "cal-api-version": "2024-06-14"
                    },
                    timeout=15
                )
                
                logger.info(f"Booking response status: {response.status_code}")
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    logger.info(f"Booking created: {data.get('data', {}).get('id')}")
                    return {
                        "success": True,
                        "booking": data.get("data", data)
                    }
                else:
                    logger.error(f"Booking failed: {response.text}")
                    return {
                        "success": False,
                        "error": response.text
                    }
                    
        except Exception as e:
            logger.error(f"Error creating booking: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def get_bookings(self) -> List[Dict[str, Any]]:
        """Get all bookings"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/bookings",
                    params={"apiKey": self.api_key},
                    headers=self.headers,
                    timeout=10
                )
                response.raise_for_status()
                data = response.json()
                return data.get("bookings", [])
        except Exception as e:
            logger.error(f"Error getting bookings: {e}")
            return []


# Function definitions for LLM function calling
BOOKING_FUNCTIONS = [
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Check available time slots for booking an appointment. Call this when the user wants to know what times are available.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "The date to check availability for in YYYY-MM-DD format"
                    }
                },
                "required": ["date"]
            }
        }
    },
    {
        "type": "function", 
        "function": {
            "name": "create_booking",
            "description": "REQUIRED: You MUST call this function to actually create a booking. Never say you've booked without calling this. Call when you have: name, email, date, and time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "The date for the booking in YYYY-MM-DD format"
                    },
                    "time": {
                        "type": "string", 
                        "description": "The time for the booking (e.g. '11:00' or '14:30')"
                    },
                    "name": {
                        "type": "string",
                        "description": "The name of the person booking"
                    },
                    "email": {
                        "type": "string",
                        "description": "The email address of the person booking"
                    }
                },
                "required": ["date", "time", "name", "email"]
            }
        }
    }
]


async def execute_function(
    function_name: str,
    arguments: Dict[str, Any],
    cal_service: CalComService,
    event_type_id: int
) -> str:
    """Execute a function call and return the result as a string for the LLM"""
    
    if function_name == "check_availability":
        date = arguments.get("date")
        if not date:
            return "What date would you like me to check?"
        
        try:
            # Get real availability from Cal.com
            end_date = (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
            logger.info(f"Checking availability for {date} to {end_date}")
            
            slots_data = await cal_service.get_slots(
                event_type_id=event_type_id,
                start_date=date,
                end_date=end_date
            )
            
            slots = slots_data.get("data", {}).get("slots", {})
            if slots:
                # Get slots for this date
                day_slots = slots.get(date, [])
                if day_slots:
                    # Format available times nicely - convert UTC to Pacific (UTC-7)
                    times = []
                    seen_hours = set()
                    for slot in day_slots[:8]:  # Check more slots to get variety
                        time_str = slot.get("time", "")
                        if time_str:
                            try:
                                dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                                # Convert UTC to Pacific (subtract 7 hours)
                                local_hour = (dt.hour - 7) % 24
                                
                                # Skip if we already have this hour
                                if local_hour in seen_hours:
                                    continue
                                seen_hours.add(local_hour)
                                
                                # Format nicely
                                if local_hour == 0:
                                    times.append("12 AM")
                                elif local_hour < 12:
                                    times.append(f"{local_hour} AM")
                                elif local_hour == 12:
                                    times.append("12 PM")
                                else:
                                    times.append(f"{local_hour - 12} PM")
                                
                                if len(times) >= 4:
                                    break
                            except:
                                pass
                    
                    if times:
                        if len(times) > 1:
                            return f"I have openings at {', '.join(times[:-1])} and {times[-1]}. Which works best for you?"
                        else:
                            return f"I have an opening at {times[0]}. Would that work for you?"
            
            return "I have some openings on that day. What time works best for you?"
            
        except Exception as e:
            logger.error(f"Error checking availability: {e}")
            return "I have some openings on that day. What time works best for you?"
    
    elif function_name == "create_booking":
        date = arguments.get("date")
        time_str = arguments.get("time")
        name = arguments.get("name")
        email = arguments.get("email")
        
        if not name:
            return "What name should I put the booking under?"
        if not email:
            return "And what's your email address?"
        if not date:
            return "What date works for you?"
        if not time_str:
            return "What time would you prefer?"
        
        # Convert spoken email to actual email format
        # "ethan jasper at gmail dot com" -> "ethanjasper@gmail.com"
        email_cleaned = str(email).lower().strip()
        email_cleaned = email_cleaned.replace(" at ", "@").replace("at ", "@").replace(" at", "@")
        email_cleaned = email_cleaned.replace(" dot ", ".").replace("dot ", ".").replace(" dot", ".")
        email_cleaned = email_cleaned.replace(" ", "")  # Remove remaining spaces
        
        # Validate email format
        if "@" not in email_cleaned or "." not in email_cleaned:
            logger.warning(f"Invalid email format after cleanup: {email} -> {email_cleaned}")
            return "I didn't catch that email correctly. Could you say it like: john smith at gmail dot com?"
        
        logger.info(f"Email converted: '{email}' -> '{email_cleaned}'")
        
        try:
            # Parse time to proper format
            hour = 9  # default
            is_pm = "pm" in str(time_str).lower()
            is_am = "am" in str(time_str).lower()
            
            # Extract hour number
            time_clean = str(time_str).lower().replace("am", "").replace("pm", "").replace(" ", "").replace(":", "")
            try:
                hour = int(time_clean[:2] if len(time_clean) >= 2 and time_clean[:2].isdigit() else time_clean[:1])
            except:
                hour = 9
            
            # Convert to 24h format
            if is_pm and hour != 12:
                hour += 12
            elif is_am and hour == 12:
                hour = 0
            
            # Convert local time to UTC using the Cal.com user's timezone
            from datetime import datetime as dt, timedelta
            local_dt = dt.strptime(f"{date}T{hour:02d}:00:00", "%Y-%m-%dT%H:%M:%S")
            
            # Get UTC offset for user's timezone (negative means behind UTC)
            utc_offset = cal_service.get_utc_offset()
            utc_dt = local_dt - timedelta(hours=utc_offset)  # Subtract offset to get UTC
            
            start_time = utc_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            
            logger.info(f"Creating booking: {name} ({email_cleaned}) - User said {hour}:00 {cal_service.user_timezone}, sending {start_time} UTC")
            
            result = await cal_service.create_booking(
                event_type_id=event_type_id,
                start_time=start_time,
                name=name,
                email=email_cleaned
            )
            
            if result.get("success"):
                booking = result.get("booking", {})
                logger.info(f"Booking created successfully: ID {booking.get('id')}")
                return f"You're all set {name}! I've booked your appointment and sent a confirmation to {email}. Is there anything else I can help with?"
            else:
                logger.error(f"Booking failed: {result.get('error')}")
                return f"I had trouble booking that time. Would you like to try a different time?"
                
        except Exception as e:
            logger.error(f"Error creating booking: {e}")
            return f"I had trouble completing that booking. Would you like to try again?"
    
    return "I'm not sure how to help with that. Could you try asking differently?"
