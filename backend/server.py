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
    speaking_cooldown = 0  # Time until we accept new input
    
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
        nonlocal is_speaking, conversation
        is_speaking = True
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
                            if should_stop: 
                                logger.info("Forward stopped - should_stop is True")
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
                            if should_stop: break
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
                        if buf:
                            await tts.send(json.dumps({"text": buf, "try_trigger_generation": True}))
                
                await tts.send(json.dumps({"text": ""}))
                await asyncio.sleep(0.5)
                audio_task.cancel()
                await websocket.send_json({"type": "audio_end"})
        except Exception as e:
            logger.error(f"Respond error: {e}")
        
        conversation.append({"role": "assistant", "content": full_response})
        is_speaking = False
        speaking_cooldown = time.time() + 0.5  # 500ms cooldown
    
    try:
        async with websockets.connect(
            "wss://api.deepgram.com/v1/listen?punctuate=true&utterance_end_ms=1500&vad_events=true",
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
            interrupt_buffer = ""  # Collect speech during AI talking
            processing_lock = False  # Prevent overlapping responses
            
            async def process():
                nonlocal transcript_buffer, last_transcript_time, interrupt_buffer, processing_lock
                
                # Prevent multiple simultaneous responses
                if processing_lock or is_speaking:
                    return
                
                msg = transcript_buffer.strip()
                if not msg or should_stop:
                    return
                
                processing_lock = True
                transcript_buffer = ""
                
                logger.info(f"Processing: {msg}")
                
                try:
                    await websocket.send_json({"type": "status", "status": "speaking"})
                    await respond(msg)
                    
                    # After speaking, check if user interrupted with something meaningful
                    if interrupt_buffer.strip() and len(interrupt_buffer.split()) >= 2:
                        logger.info(f"User interrupted with: {interrupt_buffer}")
                        transcript_buffer = interrupt_buffer
                        interrupt_buffer = ""
                        processing_lock = False
                        await asyncio.sleep(0.3)
                        await process()
                    else:
                        interrupt_buffer = ""
                        if not should_stop:
                            await websocket.send_json({"type": "status", "status": "listening"})
                except Exception as e:
                    logger.error(f"Process error: {e}")
                finally:
                    processing_lock = False
            
            async def handle_dg():
                nonlocal transcript_buffer, response_task, should_stop, last_transcript_time, interrupt_buffer
                try:
                    async for msg in dg:
                        if should_stop: break
                        
                        data = json.loads(msg)
                        
                        # Collect transcripts but don't process yet
                        if data.get("type") == "Results":
                            t = data.get("channel", {}).get("alternatives", [{}])[0].get("transcript", "")
                            if t and data.get("is_final"):
                                last_transcript_time = time.time()
                                logger.info(f"Got: {t}")
                                
                                if is_speaking:
                                    interrupt_buffer += " " + t
                                    logger.info(f"Interrupt collected: {t}")
                                else:
                                    transcript_buffer += " " + t
                        
                        # UtteranceEnd = user stopped speaking, NOW process
                        elif data.get("type") == "UtteranceEnd":
                            logger.info("UtteranceEnd detected")
                            if not is_speaking and transcript_buffer.strip():
                                if response_task and not response_task.done(): 
                                    response_task.cancel()
                                response_task = asyncio.create_task(process())
                                
                except Exception as e:
                    logger.error(f"DG error: {e}")
            
            async def handle_client():
                nonlocal should_stop
                try:
                    while not should_stop:
                        msg = await websocket.receive()
                        if msg["type"] == "websocket.receive":
                            if "bytes" in msg:
                                # Always send audio to Deepgram for interrupt detection
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
