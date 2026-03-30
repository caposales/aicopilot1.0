from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response, JSONResponse
import os
import logging
from pathlib import Path
import httpx
import asyncio
import websockets
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create the main app
app = FastAPI()

# Next.js app URL (running on port 3000) - configurable via env
NEXTJS_URL = os.environ.get('NEXTJS_URL', 'http://localhost:3000')

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Health check endpoint
@app.get("/")
async def health_check():
    return {"status": "ok", "service": "backend-proxy"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

# WebSocket proxy for Deepgram - handles the connection server-side
# Route: /api/ws/deepgram to work with Kubernetes ingress
@app.websocket("/api/ws/deepgram")
async def deepgram_websocket_proxy(websocket: WebSocket):
    """Proxy WebSocket connection to Deepgram for real-time STT"""
    await websocket.accept()
    
    # Get Deepgram API key from environment
    deepgram_key = os.environ.get('DEEPGRAM_API_KEY')
    logger.info(f"Deepgram key loaded: {deepgram_key[:10] if deepgram_key else 'NONE'}...")
    
    if not deepgram_key:
        await websocket.send_json({"error": "Deepgram API key not configured"})
        await websocket.close()
        return
    
    # Build Deepgram WebSocket URL - use simpler URL, params can cause issues
    deepgram_url = "wss://api.deepgram.com/v1/listen"
    
    try:
        # Connect to Deepgram using Authorization header
        headers = {"Authorization": f"Token {deepgram_key}"}
        logger.info(f"Connecting to Deepgram with headers: {list(headers.keys())}")
        
        async with websockets.connect(
            deepgram_url,
            additional_headers=headers
        ) as deepgram_ws:
            logger.info("Connected to Deepgram WebSocket successfully!")
            
            # Send confirmation to client
            await websocket.send_json({"type": "connected"})
            
            async def forward_to_deepgram():
                """Forward audio from client to Deepgram"""
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await deepgram_ws.send(data)
                except WebSocketDisconnect:
                    logger.info("Client disconnected")
                except Exception as e:
                    logger.error(f"Forward to Deepgram error: {e}")
            
            async def forward_to_client():
                """Forward transcription from Deepgram to client"""
                try:
                    async for message in deepgram_ws:
                        await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"Forward to client error: {e}")
            
            # Run both forwarding tasks concurrently
            await asyncio.gather(
                forward_to_deepgram(),
                forward_to_client(),
                return_exceptions=True
            )
            
    except Exception as e:
        logger.error(f"Deepgram WebSocket error: {type(e).__name__}: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass

# Proxy all /api requests to Next.js with retry logic
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_to_nextjs(request: Request, path: str):
    """Proxy all API requests to the Next.js server with retry logic"""
    
    # Build the target URL
    target_url = f"{NEXTJS_URL}/api/{path}"
    
    # Get request body if present
    body = await request.body()
    
    # Forward headers (excluding host)
    headers = dict(request.headers)
    headers.pop('host', None)
    
    # Retry logic for when Next.js is still starting
    max_retries = 3
    retry_delay = 2  # seconds
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.request(
                    method=request.method,
                    url=target_url,
                    content=body,
                    headers=headers,
                    params=dict(request.query_params),
                    timeout=30.0
                )
                
                # Return the response from Next.js
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    headers=dict(response.headers)
                )
        except httpx.ConnectError as e:
            if attempt < max_retries - 1:
                logger.warning(f"Next.js not ready, retry {attempt + 1}/{max_retries} in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
            else:
                logger.error(f"Proxy error after {max_retries} retries: {e}")
                return JSONResponse(
                    status_code=503,
                    content={"error": "Service temporarily unavailable", "detail": "Next.js server is starting up, please retry in a few seconds"}
                )
        except Exception as e:
            logger.error(f"Proxy error: {e}")
            return JSONResponse(
                status_code=502,
                content={"error": "Proxy error", "detail": str(e)}
            )
    
    return JSONResponse(
        status_code=503,
        content={"error": "Service unavailable"}
    )
