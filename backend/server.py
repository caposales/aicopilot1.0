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
import time

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI()
NEXTJS_URL = os.environ.get('NEXTJS_URL', 'http://localhost:3000')

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.get("/")
async def health():
    return {"status": "ok"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.websocket("/api/ws/realtime")
async def realtime_conversation(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connected")
    
    deepgram_key = os.environ.get('DEEPGRAM_API_KEY')
    elevenlabs_key = os.environ.get('ELEVENLABS_API_KEY')
    groq_key = os.environ.get('GROQ_API_KEY')
    
    if not all([deepgram_key, elevenlabs_key, groq_key]):
        await websocket.send_json({"type": "error", "message": "Missing API keys"})
        await websocket.close()
        return
    
    # Get config
    try:
        config = await asyncio.wait_for(websocket.receive_json(), timeout=5)
        voice_id = config.get('voiceId', 'EXAVITQu4vr4xnSDxMaL')
        system_prompt = config.get('systemPrompt', 'Be helpful and concise. One sentence max.')
        initial_message = config.get('initialMessage', 'Hello!')
    except:
        voice_id = 'EXAVITQu4vr4xnSDxMaL'
        system_prompt = 'Be helpful and concise.'
        initial_message = 'Hello!'
    
    is_speaking = False
    should_stop = False
    transcript_buffer = ""
    conversation = []
    stop_speaking = False  # Flag to interrupt TTS
    
    async def speak(text):
        nonlocal is_speaking
        is_speaking = True
        try:
            uri = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5"
            async with websockets.connect(uri) as tts:
                await tts.send(json.dumps({
                    "text": " ",
                    "output_format": "pcm_24000",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                    "xi_api_key": elevenlabs_key
                }))
                await tts.send(json.dumps({"text": text + " ", "try_trigger_generation": True}))
                await tts.send(json.dumps({"text": ""}))
                
                async for msg in tts:
                    if should_stop:
                        break
                    try:
                        data = json.loads(msg)
                        if data.get("audio"):
                            await websocket.send_json({"type": "audio", "data": data["audio"]})
                        if data.get("isFinal"):
                            break
                    except:
                        pass
                await websocket.send_json({"type": "audio_end"})
        except Exception as e:
            logger.error(f"TTS error: {e}")
        finally:
            is_speaking = False
            speaking_cooldown = time.time() + 0.5  # 500ms cooldown after speaking
    
    async def respond(user_msg):
        nonlocal is_speaking, conversation, stop_speaking
        is_speaking = True
        stop_speaking = False  # Reset flag
        conversation.append({"role": "user", "content": user_msg})
        
        messages = [{"role": "system", "content": system_prompt}] + conversation[-4:]
        full_response = ""
        
        try:
            uri = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5"
            async with websockets.connect(uri) as tts:
                await tts.send(json.dumps({
                    "text": " ",
                    "output_format": "pcm_24000",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                    "xi_api_key": elevenlabs_key
                }))
                
                # Forward audio task
                async def forward():
                    try:
                        async for msg in tts:
                            if should_stop or stop_speaking: 
                                logger.info("Stopping TTS - user interrupted")
                                break
                            try:
                                d = json.loads(msg)
                                if d.get("audio"):
                                    await websocket.send_json({"type": "audio", "data": d["audio"]})
                            except Exception as e: 
                                logger.error(f"Audio forward error: {e}")
                    except Exception as e: 
                        logger.error(f"Forward task error: {e}")
                
                audio_task = asyncio.create_task(forward())
                
                # Stream LLM from Groq (ultra fast)
                async with httpx.AsyncClient() as client:
                    async with client.stream(
                        "POST",
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                        json={"model": "llama-3.1-8b-instant", "messages": messages, "max_tokens": 200, "stream": True},
                        timeout=30.0
                    ) as resp:
                        buf = ""
                        async for line in resp.aiter_lines():
                            if should_stop or stop_speaking: break
                            if line.startswith("data: ") and "[DONE]" not in line:
                                try:
                                    c = json.loads(line[6:]).get("choices", [{}])[0].get("delta", {}).get("content", "")
                                    if c:
                                        full_response += c
                                        buf += c
                                        if ' ' in buf or any(p in buf for p in '.!?,'):
                                            await tts.send(json.dumps({"text": buf, "try_trigger_generation": True}))
                                            buf = ""
                                except: pass
                        if buf and not stop_speaking:
                            await tts.send(json.dumps({"text": buf, "try_trigger_generation": True}))
                
                await tts.send(json.dumps({"text": ""}))
                await asyncio.sleep(0.3)
                audio_task.cancel()
                await websocket.send_json({"type": "audio_end"})
        except Exception as e:
            logger.error(f"Respond error: {e}")
        
        if full_response:
            conversation.append({"role": "assistant", "content": full_response})
        is_speaking = False
    
    try:
        async with websockets.connect(
            "wss://api.deepgram.com/v1/listen",
            additional_headers={"Authorization": f"Token {deepgram_key}"}
        ) as dg:
            logger.info("Connected to Deepgram")
            await websocket.send_json({"type": "connected"})
            
            # Greeting
            await websocket.send_json({"type": "status", "status": "speaking"})
            await speak(initial_message)
            conversation.append({"role": "assistant", "content": initial_message})
            await websocket.send_json({"type": "status", "status": "listening"})
            
            response_task = None
            last_transcript_time = 0
            interrupt_buffer = ""
            processing_lock = False
            pending_process = None
            stop_speaking = False  # Flag to stop TTS mid-speech
            
            async def process():
                nonlocal transcript_buffer, last_transcript_time, interrupt_buffer, processing_lock, pending_process
                
                # Wait 0.8s for user to finish speaking (faster response)
                await asyncio.sleep(0.8)
                
                # If new speech came in during the wait, abort
                if time.time() - last_transcript_time < 0.7:
                    return
                
                # Prevent multiple simultaneous responses
                if processing_lock or is_speaking:
                    return
                
                msg = transcript_buffer.strip()
                # Require at least 3 words to process
                if not msg or len(msg.split()) < 3 or should_stop:
                    return
                
                processing_lock = True
                transcript_buffer = ""
                pending_process = None
                
                logger.info(f"Processing: {msg}")
                
                try:
                    await websocket.send_json({"type": "status", "status": "speaking"})
                    await respond(msg)
                    
                    # After speaking, if there was an interrupt, add it to buffer for next turn
                    if interrupt_buffer.strip():
                        logger.info(f"Had interrupt: {interrupt_buffer}")
                        transcript_buffer = interrupt_buffer
                        interrupt_buffer = ""
                    
                    if not should_stop:
                        await websocket.send_json({"type": "status", "status": "listening"})
                except Exception as e:
                    logger.error(f"Process error: {e}")
                finally:
                    processing_lock = False
            
            async def handle_dg():
                nonlocal transcript_buffer, response_task, should_stop, last_transcript_time, interrupt_buffer, pending_process, stop_speaking
                try:
                    async for msg in dg:
                        if should_stop: break
                        
                        data = json.loads(msg)
                        
                        if data.get("type") == "Results":
                            t = data.get("channel", {}).get("alternatives", [{}])[0].get("transcript", "")
                            if t and data.get("is_final"):
                                last_transcript_time = time.time()
                                logger.info(f"Got: {t}")
                                
                                if is_speaking or processing_lock:
                                    # User is interrupting - stop AI and collect their speech
                                    interrupt_buffer += " " + t
                                    stop_speaking = True  # Signal to stop TTS
                                    logger.info(f"INTERRUPT - stopping AI: {t}")
                                else:
                                    transcript_buffer += " " + t
                                    # Cancel any pending process and start fresh timer
                                    if pending_process and not pending_process.done(): 
                                        pending_process.cancel()
                                    pending_process = asyncio.create_task(process())
                                
                except Exception as e:
                    logger.error(f"DG error: {e}")
            
            async def handle_client():
                nonlocal should_stop
                try:
                    while not should_stop:
                        msg = await websocket.receive()
                        if msg["type"] == "websocket.receive":
                            if "bytes" in msg:
                                # Only send audio to Deepgram when AI is NOT speaking
                                # This prevents echo (AI's voice triggering interrupts)
                                if not is_speaking and not processing_lock:
                                    await dg.send(msg["bytes"])
                            elif "text" in msg:
                                d = json.loads(msg["text"])
                                if d.get("type") == "stop":
                                    should_stop = True
                                    break
                except: pass
                finally:
                    should_stop = True
            
            await asyncio.gather(handle_dg(), handle_client(), return_exceptions=True)
    except Exception as e:
        logger.error(f"Main error: {e}")
    finally:
        try: await websocket.close()
        except: pass


# Proxy
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy(request: Request, path: str):
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() != 'host'}
    
    try:
        async with httpx.AsyncClient() as client:
            r = await client.request(
                method=request.method,
                url=f"{NEXTJS_URL}/api/{path}",
                content=body,
                headers=headers,
                params=dict(request.query_params),
                timeout=30.0
            )
            return Response(content=r.content, status_code=r.status_code, headers=dict(r.headers))
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": str(e)})
