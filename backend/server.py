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
        base_prompt = config.get('systemPrompt', 'You are a helpful assistant.')
        # Add conversational guidance
        system_prompt = base_prompt + " Be conversational and natural. Give complete but concise answers. If the user asks a follow-up question, smoothly address it."
        initial_message = config.get('initialMessage', 'Hello!')
    except:
        voice_id = 'EXAVITQu4vr4xnSDxMaL'
        system_prompt = 'You are a helpful assistant. Be conversational and natural. Give complete but concise answers.'
        initial_message = 'Hello!'
    
    is_speaking = False
    should_stop = False
    transcript_buffer = ""
    conversation = []
    stop_tts = False  # Signal to stop TTS on interrupt
    state = {"audio_playing_until": 0}  # Use dict for mutable state sharing
    
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
            await asyncio.sleep(0.5)  # Cooldown to prevent echo pickup
            is_speaking = False
    
    async def respond(user_msg):
        nonlocal is_speaking, conversation, stop_tts
        is_speaking = True
        stop_tts = False
        conversation.append({"role": "user", "content": user_msg})
        
        messages = [{"role": "system", "content": system_prompt}] + conversation[-6:]
        full_response = ""
        audio_chunks_sent = 0
        
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
                    nonlocal audio_chunks_sent
                    try:
                        async for msg in tts:
                            if should_stop or stop_tts: 
                                logger.info("TTS interrupted by user")
                                break
                            try:
                                d = json.loads(msg)
                                if d.get("audio"):
                                    await websocket.send_json({"type": "audio", "data": d["audio"]})
                                    audio_chunks_sent += 1
                                    # Update audio timer as we send - each chunk adds ~0.1s of playback
                                    state["audio_playing_until"] = time.time() + 2.0  # Reset to 2s from now
                            except Exception as e: 
                                logger.error(f"Audio forward error: {e}")
                    except Exception as e: 
                        logger.error(f"Forward task error: {e}")
                
                audio_task = asyncio.create_task(forward())
                
                # Stream LLM from Groq
                async with httpx.AsyncClient() as client:
                    async with client.stream(
                        "POST",
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                        json={"model": "llama-3.1-8b-instant", "messages": messages, "max_tokens": 300, "stream": True},
                        timeout=30.0
                    ) as resp:
                        buf = ""
                        async for line in resp.aiter_lines():
                            if should_stop or stop_tts: break
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
                        if buf and not stop_tts:
                            await tts.send(json.dumps({"text": buf, "try_trigger_generation": True}))
                
                await tts.send(json.dumps({"text": ""}))
                
                # Wait for audio unless interrupted
                if not stop_tts:
                    try:
                        await asyncio.wait_for(audio_task, timeout=15.0)
                    except asyncio.TimeoutError:
                        audio_task.cancel()
                    # Add extra buffer time AFTER all chunks sent - audio still playing in browser
                    state["audio_playing_until"] = time.time() + 3.0
                    logger.info(f"Audio sent: {audio_chunks_sent} chunks, playing until +3.0s more")
                else:
                    # Interrupted - let current chunks finish playing briefly
                    await asyncio.sleep(0.3)
                    audio_task.cancel()
                    state["audio_playing_until"] = 0
                
                await websocket.send_json({"type": "audio_end"})
                
        except Exception as e:
            logger.error(f"Respond error: {e}")
        
        if full_response:
            conversation.append({"role": "assistant", "content": full_response})
        # Keep is_speaking true a bit longer to catch quick follow-ups
        await asyncio.sleep(0.5)
        is_speaking = False
    
    try:
        # Use Deepgram's endpointing + utterance detection for natural turn-taking
        dg_url = "wss://api.deepgram.com/v1/listen?endpointing=300&utterance_end_ms=1000&interim_results=true&punctuate=true"
        async with websockets.connect(
            dg_url,
            additional_headers={"Authorization": f"Token {deepgram_key}"}
        ) as dg:
            logger.info("Connected to Deepgram with endpointing")
            await websocket.send_json({"type": "connected"})
            
            # Greeting
            await websocket.send_json({"type": "status", "status": "speaking"})
            await speak(initial_message)
            conversation.append({"role": "assistant", "content": initial_message})
            await websocket.send_json({"type": "status", "status": "listening"})
            
            response_task = None
            last_transcript_time = 0
            processing_lock = False
            pending_process = None
            
            async def process():
                nonlocal transcript_buffer, last_transcript_time, processing_lock, pending_process
                
                # Brief delay to batch any final words
                await asyncio.sleep(0.3)
                
                # Prevent multiple simultaneous responses
                if processing_lock or is_speaking:
                    return
                
                msg = transcript_buffer.strip()
                if not msg or len(msg.split()) < 2 or should_stop:
                    return
                
                processing_lock = True
                transcript_buffer = ""
                pending_process = None
                
                logger.info(f"Processing: {msg}")
                
                try:
                    await websocket.send_json({"type": "status", "status": "speaking"})
                    await respond(msg)
                    if not should_stop:
                        await websocket.send_json({"type": "status", "status": "listening"})
                except Exception as e:
                    logger.error(f"Process error: {e}")
                finally:
                    processing_lock = False
            
            async def handle_dg():
                nonlocal transcript_buffer, response_task, should_stop, last_transcript_time, pending_process, stop_tts
                
                current_utterance = ""
                interrupt_speech = ""  # What user says while AI is talking
                
                def is_ai_busy():
                    """Check if AI is speaking or audio is still playing"""
                    return is_speaking or processing_lock or time.time() < state["audio_playing_until"]
                
                try:
                    async for msg in dg:
                        if should_stop: break
                        
                        data = json.loads(msg)
                        
                        # UtteranceEnd = backup trigger if speech_final didn't fire
                        if data.get("type") == "UtteranceEnd":
                            # Only process if we have enough words (prevent partial sentences)
                            if current_utterance.strip() and len(current_utterance.split()) >= 4 and not is_ai_busy():
                                logger.info(f"UtteranceEnd - processing: {current_utterance.strip()}")
                                transcript_buffer = current_utterance
                                current_utterance = ""
                                if pending_process and not pending_process.done():
                                    pending_process.cancel()
                                pending_process = asyncio.create_task(process())
                            continue
                        
                        if data.get("type") == "Results":
                            alt = data.get("channel", {}).get("alternatives", [{}])[0]
                            t = alt.get("transcript", "")
                            is_final = data.get("is_final", False)
                            speech_final = data.get("speech_final", False)
                            
                            if not t:
                                continue
                                
                            last_transcript_time = time.time()
                            
                            # If AI is busy (speaking or audio playing), collect as interrupt
                            busy = is_ai_busy()
                            if busy:
                                if is_final:
                                    interrupt_speech += " " + t
                                    word_count = len(interrupt_speech.split())
                                    logger.info(f"[BUSY] Interrupt ({word_count} words): {interrupt_speech.strip()}")
                                    
                                    # 4+ words = real follow-up question
                                    # Stop generating MORE text, but let current audio finish
                                    if word_count >= 4 and not stop_tts:
                                        logger.info(f"User follow-up detected: {interrupt_speech.strip()}")
                                        stop_tts = True  # Stop generating more LLM/TTS
                                        state["audio_playing_until"] = 0  # Clear audio timer
                                        # Queue this to be answered after current audio
                                        current_utterance = interrupt_speech
                                        interrupt_speech = ""
                            else:
                                # AI not busy - normal flow
                                logger.info(f"[NOT BUSY] is_speaking={is_speaking}, processing_lock={processing_lock}, audio_until={state['audio_playing_until'] - time.time():.1f}s")
                                if interrupt_speech.strip():
                                    current_utterance = interrupt_speech
                                    interrupt_speech = ""
                                
                                if is_final:
                                    current_utterance += " " + t
                                    logger.info(f"Accumulated: {current_utterance.strip()}")
                                
                                # speech_final = VAD says user stopped, process now
                                if speech_final and current_utterance.strip() and len(current_utterance.split()) >= 2:
                                    # Double-check we're not busy before processing
                                    if not is_ai_busy():
                                        logger.info(f"speech_final - processing: {current_utterance.strip()}")
                                        transcript_buffer = current_utterance
                                        current_utterance = ""
                                        if pending_process and not pending_process.done():
                                            pending_process.cancel()
                                        pending_process = asyncio.create_task(process())
                                    else:
                                        # AI still busy - treat as interrupt
                                        logger.info(f"speech_final but AI busy - treating as interrupt: {current_utterance.strip()}")
                                        interrupt_speech = current_utterance
                                        current_utterance = ""
                                
                except Exception as e:
                    logger.error(f"DG error: {e}")
            
            async def handle_client():
                nonlocal should_stop
                try:
                    while not should_stop:
                        msg = await websocket.receive()
                        if msg["type"] == "websocket.receive":
                            if "bytes" in msg:
                                # Always send audio - let handle_dg decide what to do with transcripts
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
