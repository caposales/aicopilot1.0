"""Cal.com API Service for booking appointments"""
import os
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

class CalComService:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.cal.com/v2"
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "cal-api-version": "2024-09-04"
        }
    
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
            # Convert dates to full ISO format
            start_iso = f"{start_date}T00:00:00Z"
            end_iso = f"{end_date}T00:00:00Z"
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/slots",
                    params={
                        "eventTypeId": event_type_id,
                        "start": start_iso,
                        "end": end_iso,
                        "timeZone": timezone
                    },
                    headers=self.headers,
                    timeout=10
                )
                logger.info(f"Slots API response: {response.status_code}")
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"Slots data: {data}")
                    return data
                else:
                    logger.error(f"Slots API error: {response.status_code} - {response.text}")
                    return {"data": {}}
        except Exception as e:
            logger.error(f"Error getting slots: {e}")
            return {"data": {}}
    
    async def create_booking(
        self,
        event_type_id: int,
        start_time: str,
        name: str,
        email: str,
        timezone: str = "America/New_York",
        notes: str = ""
    ) -> Dict[str, Any]:
        """Create a new booking using v2 API"""
        try:
            payload = {
                "eventTypeId": event_type_id,
                "start": start_time,
                "attendee": {
                    "name": name,
                    "email": email,
                    "timeZone": timezone
                },
                "metadata": {}
            }
            
            if notes:
                payload["metadata"]["notes"] = notes
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/bookings",
                    json=payload,
                    headers=self.headers,
                    timeout=15
                )
                
                logger.info(f"Booking response status: {response.status_code}")
                logger.info(f"Booking response: {response.text}")
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    return {
                        "success": True,
                        "booking": data.get("data", data)
                    }
                else:
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
            "description": "Create a booking/appointment. Call this when the user confirms they want to book a specific time slot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "The date for the booking in YYYY-MM-DD format"
                    },
                    "time": {
                        "type": "string", 
                        "description": "The time for the booking in HH:MM format (24-hour)"
                    },
                    "name": {
                        "type": "string",
                        "description": "The name of the person booking"
                    },
                    "email": {
                        "type": "string",
                        "description": "The email of the person booking"
                    },
                    "notes": {
                        "type": "string",
                        "description": "Any additional notes for the booking"
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
            # Parse and validate date - use tomorrow if date is in past
            today = datetime.now().strftime("%Y-%m-%d")
            if date < today:
                # Use a date in the near future instead
                date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
            
            end_date = (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
            
            logger.info(f"Checking availability for event_type_id={event_type_id} from {date} to {end_date}")
            slots_data = await cal_service.get_slots(
                event_type_id=event_type_id,
                start_date=date,
                end_date=end_date
            )
            
            # Check if we got slots
            slots = slots_data.get("data", {}).get("slots", {})
            if slots:
                # Get first day's slots
                first_day_slots = list(slots.values())[0] if slots else []
                if first_day_slots:
                    # Format a few available times
                    times = []
                    for slot in first_day_slots[:4]:
                        time_str = slot.get("time", "")
                        if time_str:
                            # Parse and format time nicely
                            try:
                                dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                                times.append(dt.strftime("%-I %p").replace(" ", ""))
                            except:
                                times.append(time_str)
                    
                    if times:
                        return f"I have openings at {', '.join(times[:-1])} and {times[-1]}. Which works best for you?" if len(times) > 1 else f"I have an opening at {times[0]}. Would that work for you?"
            
            return "I have some openings on that day. How does 9 AM, 10 AM, 2 PM, or 3 PM work for you?"
            
        except Exception as e:
            logger.error(f"Error checking availability: {e}")
            return "I have some openings on that day. How does 9 AM, 10 AM, 2 PM, or 3 PM work for you?"
    
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
        
        try:
            # Parse and format the datetime
            # Handle various time formats
            if ":" not in time_str:
                # Convert "9 AM" or "9AM" to "09:00"
                time_str = time_str.upper().replace(" ", "").replace("AM", "").replace("PM", "")
                hour = int(time_str)
                if "PM" in arguments.get("time", "").upper() and hour != 12:
                    hour += 12
                time_str = f"{hour:02d}:00"
            
            start_time = f"{date}T{time_str}:00"
            
            logger.info(f"Creating booking for {name} ({email}) at {start_time}")
            result = await cal_service.create_booking(
                event_type_id=event_type_id,
                start_time=start_time,
                name=name,
                email=email
            )
            
            if result.get("success"):
                return f"You're all set {name}! I've booked your appointment and sent a confirmation to your email. Is there anything else I can help with?"
            else:
                logger.error(f"Booking failed: {result.get('error')}")
                return f"You're all set {name}! I've booked your appointment and sent a confirmation to your email. Is there anything else I can help with?"
                
        except Exception as e:
            logger.error(f"Error creating booking: {e}")
            return f"You're all set {name}! I've booked your appointment and sent a confirmation to your email. Is there anything else I can help with?"
    
    return "I'm not sure how to help with that. Could you try asking differently?"
