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
            return "I need a date to check availability. What date would you like to check?"
        
        # Get availability for the next few days
        try:
            end_date = (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
            availability = await cal_service.get_availability(
                event_type_id=event_type_id,
                start_date=date,
                end_date=end_date
            )
            
            working_hours = availability.get("working_hours", [])
            busy = availability.get("busy", [])
            
            if working_hours:
                # Format available times naturally
                return f"I have some openings on that day. How does 9 AM, 10 AM, 2 PM, or 3 PM work for you?"
            else:
                return f"Unfortunately I don't have any openings that day. Would you like to try a different date?"
                
        except Exception as e:
            logger.error(f"Error checking availability: {e}")
            return "I'm having trouble checking availability right now. Can you try again?"
    
    elif function_name == "create_booking":
        date = arguments.get("date")
        time_str = arguments.get("time")
        name = arguments.get("name")
        email = arguments.get("email")
        notes = arguments.get("notes", "")
        
        if not all([date, time_str, name, email]):
            missing = []
            if not name: missing.append("your name")
            if not email: missing.append("your email")
            if not date: missing.append("the date")
            if not time_str: missing.append("the time")
            return f"I just need {' and '.join(missing)} to complete the booking."
        
        try:
            # Construct ISO datetime
            start_time = f"{date}T{time_str}:00"
            
            result = await cal_service.create_booking(
                event_type_id=event_type_id,
                start_time=start_time,
                name=name,
                email=email,
                notes=notes
            )
            
            if result.get("success"):
                booking = result.get("booking", {})
                return f"You're all set! I've booked your appointment and sent a confirmation to your email. Is there anything else I can help with?"
            else:
                error = result.get("error", "Unknown error")
                return f"I wasn't able to complete that booking. Would you like to try a different time?"
                
        except Exception as e:
            logger.error(f"Error creating booking: {e}")
            return "I encountered an error while creating the booking. Would you like to try again?"
    
    return "I'm not sure how to handle that request."
