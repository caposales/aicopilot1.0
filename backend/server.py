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
import base64

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


# =============================================================================
# ULTRA LOW LATENCY REAL-TIME CONVERSATION
# Deepgram STT -> OpenAI Streaming -> ElevenLabs WebSocket TTS (PCM)
# =============================================================================

@app.websocket("/api/ws/realtime")
async def realtime_conversation(websocket: WebSocket):
    """
    Ultra low-latency streaming conversation:
    - Deepgram for instant STT
    - OpenAI streaming for word-by-word response
    - ElevenLabs WebSocket for PCM audio streaming
    """
    await websocket.accept()
    
    # Get API keys
    deepgram_key = os.environ.get('DEEPGRAM_API_KEY')
    elevenlabs_key = os.environ.get('ELEVENLABS_API_KEY')
    llm_key = os.environ.get('EMERGENT_LLM_KEY')
    
    if not all([deepgram_key, elevenlabs_key, llm_key]):
        await websocket.send_json({"type": "error", "message": "Missing API keys"})
        await websocket.close()
        return
    
    # Get config from client
    try:
        config_msg = await asyncio.wait_for(websocket.receive_json(), timeout=5)
        voice_id = config_msg.get('voiceId', 'EXAVITQu4vr4xnSDxMaL')
        system_prompt = config_msg.get('systemPrompt', 'You are a helpful assistant. Be very concise - respond in 1-2 short sentences max.')
        initial_message = config_msg.get('initialMessage', 'Hello! How can I help you?')
    except:
        voice_id = 'EXAVITQu4vr4xnSDxMaL'
        system_prompt = 'You are a helpful assistant. Be very concise.'
        initial_message = 'Hello! How can I help you?'
    
    conversation_history = []
    is_speaking = False
    should_stop = False
    transcript_buffer = ""
    
    async def stream_tts_websocket(text: str):
        """Stream TTS using ElevenLabs WebSocket API with PCM output"""
        nonlocal is_speaking
        is_speaking = True
        
        try:
            uri = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_turbo_v2"
            
            async with websockets.connect(uri) as tts_ws:
                # Send BOS (beginning of stream) with PCM format
                bos = {
                    "text": " ",
                    "output_format": "pcm_24000",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                    "xi_api_key": elevenlabs_key
                }
                await tts_ws.send(json.dumps(bos))
                
                # Send the text
                await tts_ws.send(json.dumps({
                    "text": text + " ",
                    "try_trigger_generation": True
                }))
                
                # Send EOS
                await tts_ws.send(json.dumps({"text": ""}))
                
                # Receive and forward PCM audio chunks
                async for msg in tts_ws:
                    if should_stop:
                        break
                    try:
                        data = json.loads(msg)
                        if "audio" in data and data["audio"]:
                            # Forward PCM audio directly to client
                            await websocket.send_json({
                                "type": "audio",
                                "data": data["audio"],  # Already base64
                                "format": "pcm_24000"
                            })
                        if data.get("isFinal"):
                            break
                    except json.JSONDecodeError:
                        pass
                
                await websocket.send_json({"type": "audio_end"})
                
        except Exception as e:
            logger.error(f"TTS WebSocket error: {e}")
        finally:
            is_speaking = False
    
    async def stream_llm_to_tts(user_message: str):
        """Stream LLM response directly to TTS word by word"""
        nonlocal conversation_history, is_speaking
        is_speaking = True
        
        conversation_history.append({"role": "user", "content": user_message})
        
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(conversation_history[-4:])
        
        full_response = ""
        
        try:
            # Connect to ElevenLabs WebSocket for streaming TTS
            uri = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_turbo_v2"
            
            async with websockets.connect(uri) as tts_ws:
                # Send BOS
                bos = {
                    "text": " ",
                    "output_format": "pcm_24000",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                    "xi_api_key": elevenlabs_key
                }
                await tts_ws.send(json.dumps(bos))
                
                # Task to receive audio and forward to client
                async def forward_audio():
                    try:
                        async for msg in tts_ws:
                            if should_stop:
                                break
                            try:
                                data = json.loads(msg)
                                if "audio" in data and data["audio"]:
                                    await websocket.send_json({
                                        "type": "audio",
                                        "data": data["audio"],
                                        "format": "pcm_24000"
                                    })
                            except:
                                pass
                    except Exception as e:
                        logger.error(f"Audio forward error: {e}")
                
                # Start audio forwarding task
                audio_task = asyncio.create_task(forward_audio())
                
                # Stream from LLM and send text to TTS
                async with httpx.AsyncClient() as client:
                    async with client.stream(
                        "POST",
                        "https://integrations.emergentagent.com/llm/chat/completions",
                        headers={
                            "Authorization": f"Bearer {llm_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": "gpt-5.2",
                            "messages": messages,
                            "max_tokens": 100,
                            "stream": True
                        },
                        timeout=30.0
                    ) as response:
                        word_buffer = ""
                        
                        async for line in response.aiter_lines():
                            if should_stop:
                                break
                            if line.startswith("data: "):
                                data = line[6:]
                                if data == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data)
                                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                    if content:
                                        full_response += content
                                        word_buffer += content
                                        
                                        # Send to TTS every few words or on punctuation
                                        if ' ' in word_buffer or any(p in word_buffer for p in '.!?,'):
                                            await tts_ws.send(json.dumps({
                                                "text": word_buffer,
                                                "try_trigger_generation": True
                                            }))
                                            word_buffer = ""
                                except:
                                    pass
                        
                        # Send remaining text
                        if word_buffer:
                            await tts_ws.send(json.dumps({
                                "text": word_buffer,
                                "try_trigger_generation": True
                            }))
                
                # Send EOS to TTS
                await tts_ws.send(json.dumps({"text": ""}))
                
                # Wait for audio to finish
                await asyncio.sleep(0.5)
                audio_task.cancel()
                
                await websocket.send_json({"type": "audio_end"})
        
        except Exception as e:
            logger.error(f"LLM->TTS streaming error: {e}")
        
        conversation_history.append({"role": "assistant", "content": full_response})
        is_speaking = False
    
    # Connect to Deepgram
    deepgram_url = "wss://api.deepgram.com/v1/listen"
    
    try:
        async with websockets.connect(
            deepgram_url,
            additional_headers={"Authorization": f"Token {deepgram_key}"}
        ) as deepgram_ws:
            logger.info("Connected to Deepgram")
            await websocket.send_json({"type": "connected"})
            
            # Play initial greeting
            await websocket.send_json({"type": "status", "status": "speaking"})
            await stream_tts_websocket(initial_message)
            conversation_history.append({"role": "assistant", "content": initial_message})
            await websocket.send_json({"type": "status", "status": "listening"})
            
            async def handle_deepgram():
                """Handle transcription - respond FAST"""
                nonlocal transcript_buffer, should_stop
                
                silence_task = None
                
                async def respond_now():
                    """Respond immediately"""
                    nonlocal transcript_buffer
                    await asyncio.sleep(0.2)  # 200ms - ultra fast
                    
                    if transcript_buffer.strip() and not is_speaking:
                        message = transcript_buffer.strip()
                        transcript_buffer = ""
                        
                        await websocket.send_json({"type": "status", "status": "speaking"})
                        await stream_llm_to_tts(message)
                        await websocket.send_json({"type": "status", "status": "listening"})
                
                try:
                    async for message in deepgram_ws:
                        if should_stop:
                            break
                        
                        data = json.loads(message)
                        
                        if data.get("type") == "Results":
                            alt = data.get("channel", {}).get("alternatives", [{}])[0]
                            transcript = alt.get("transcript", "")
                            is_final = data.get("is_final", False)
                            speech_final = data.get("speech_final", False)
                            
                            if transcript and is_final:
                                transcript_buffer += " " + transcript
                                
                                if silence_task:
                                    silence_task.cancel()
                                silence_task = asyncio.create_task(respond_now())
                            
                            if speech_final and transcript_buffer.strip():
                                if silence_task:
                                    silence_task.cancel()
                                asyncio.create_task(respond_now())
                        
                        elif data.get("type") == "UtteranceEnd":
                            if transcript_buffer.strip() and not is_speaking:
                                if silence_task:
                                    silence_task.cancel()
                                asyncio.create_task(respond_now())
                                
                except Exception as e:
                    logger.error(f"Deepgram handler error: {e}")
            
            async def handle_client():
                """Handle audio from client"""
                nonlocal should_stop
                try:
                    while not should_stop:
                        msg = await websocket.receive()
                        if msg["type"] == "websocket.receive":
                            if "bytes" in msg and not is_speaking:
                                await deepgram_ws.send(msg["bytes"])
                            elif "text" in msg:
                                data = json.loads(msg["text"])
                                if data.get("type") == "stop":
                                    should_stop = True
                                    break
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.error(f"Client handler error: {e}")
                finally:
                    should_stop = True
            
            await asyncio.gather(
                handle_deepgram(),
                handle_client(),
                return_exceptions=True
            )
    
    except Exception as e:
        logger.error(f"Realtime error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass


# Simple Deepgram proxy (kept for backwards compatibility)
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
