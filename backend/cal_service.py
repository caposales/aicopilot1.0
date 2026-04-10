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
        self.base_url = "https://api.cal.com/v1"
        self.headers = {
            "Content-Type": "application/json"
        }
    
    async def get_event_types(self) -> List[Dict[str, Any]]:
        """Get all event types for the user"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/event-types",
                    params={"apiKey": self.api_key},
                    headers=self.headers,
                    timeout=10
                )
                response.raise_for_status()
                data = response.json()
                return data.get("event_types", [])
        except Exception as e:
            logger.error(f"Error getting event types: {e}")
            return []
    
    async def get_availability(
        self,
        event_type_id: int,
        start_date: str,
        end_date: str,
        timezone: str = "America/New_York"
    ) -> List[Dict[str, Any]]:
        """Get available time slots for an event type"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/availability",
                    params={
                        "apiKey": self.api_key,
                        "eventTypeId": event_type_id,
                        "dateFrom": start_date,
                        "dateTo": end_date,
                        "timeZone": timezone
                    },
                    headers=self.headers,
                    timeout=10
                )
                response.raise_for_status()
                data = response.json()
                
                # Parse the busy times and calculate available slots
                busy = data.get("busy", [])
                working_hours = data.get("workingHours", [])
                
                return {
                    "busy": busy,
                    "working_hours": working_hours,
                    "timezone": data.get("timeZone", timezone)
                }
        except Exception as e:
            logger.error(f"Error getting availability: {e}")
            return {"busy": [], "working_hours": [], "timezone": timezone}
    
    async def create_booking(
        self,
        event_type_id: int,
        start_time: str,
        name: str,
        email: str,
        timezone: str = "America/New_York",
        notes: str = ""
    ) -> Dict[str, Any]:
        """Create a new booking"""
        try:
            # Calculate end time based on event type duration (default 30 min)
            start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            end_dt = start_dt + timedelta(minutes=30)
            
            payload = {
                "eventTypeId": event_type_id,
                "start": start_time,
                "end": end_dt.isoformat(),
                "responses": {
                    "name": name,
                    "email": email,
                    "notes": notes
                },
                "timeZone": timezone,
                "language": "en",
                "metadata": {}
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/bookings",
                    params={"apiKey": self.api_key},
                    json=payload,
                    headers=self.headers,
                    timeout=15
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    logger.info(f"Booking created successfully: {data}")
                    return {
                        "success": True,
                        "booking": data
                    }
                else:
                    error_msg = response.text
                    logger.error(f"Booking failed: {response.status_code} - {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg
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
        
        # For demo purposes, always return availability
        # In production, this would call the actual Cal.com API
        logger.info(f"[DEMO] Checking availability for {date}")
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
        
        # For demo purposes, always confirm booking
        # In production, this would call the actual Cal.com API
        logger.info(f"[DEMO] Booking for {name} ({email}) on {date} at {time_str}")
        return f"You're all set {name}! I've booked your appointment and sent a confirmation to your email. Is there anything else I can help with?"
    
    return "I'm not sure how to help with that. Could you try asking differently?"
