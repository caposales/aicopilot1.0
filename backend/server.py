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
from cal_service import CalComService, BOOKING_FUNCTIONS, execute_function

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
        
        # Get Cal.com config for function calling
        cal_api_key = config.get('calApiKey')
        cal_event_type_id = config.get('calEventTypeId', 1)  # Default event type ID
        cal_service = CalComService(cal_api_key) if cal_api_key else None
        use_functions = cal_service is not None
        
        if use_functions:
            logger.info("Cal.com integration enabled")
            system_prompt += " You have access to our scheduling system and can check availability and book appointments. When users want to book, naturally collect their name, email, and preferred date/time. Never mention 'tools', 'functions', or 'calling' anything - just help them naturally like a real receptionist would."
    except:
        voice_id = 'EXAVITQu4vr4xnSDxMaL'
        system_prompt = 'You are a helpful assistant. Be conversational and natural. Give complete but concise answers.'
        initial_message = 'Hello!'
        cal_service = None
        cal_event_type_id = 1
        use_functions = False
    
    state = {
        "audio_playing_until": 0,
        "is_speaking": False,
        "processing_lock": False
    }
    should_stop = False
    transcript_buffer = ""
    conversation = []
    stop_tts = False
    
    async def speak(text):
        state["is_speaking"] = True
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
            state["is_speaking"] = False
    
    async def respond(user_msg, start_time=None):
        nonlocal conversation, stop_tts
        state["is_speaking"] = True
        stop_tts = False
        conversation.append({"role": "user", "content": user_msg})
        
        if start_time:
            logger.info(f">>> respond() called {(time.time()-start_time)*1000:.0f}ms after process start")
        
        messages = [{"role": "system", "content": system_prompt}] + conversation[-6:]
        full_response = ""
        audio_chunks_sent = 0
        first_audio_time = None
        
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
                    nonlocal audio_chunks_sent, first_audio_time
                    try:
                        async for msg in tts:
                            if should_stop or stop_tts: 
                                logger.info(f">>> TTS STOPPED (sent {audio_chunks_sent} chunks)")
                                break
                            try:
                                d = json.loads(msg)
                                if d.get("audio"):
                                    if first_audio_time is None:
                                        first_audio_time = time.time()
                                        if start_time:
                                            logger.info(f">>> FIRST AUDIO {(first_audio_time-start_time)*1000:.0f}ms after process start")
                                    await websocket.send_json({"type": "audio", "data": d["audio"]})
                                    audio_chunks_sent += 1
                                    state["audio_playing_until"] = time.time() + 2.0
                            except Exception as e: 
                                logger.error(f"Audio forward error: {e}")
                    except Exception as e: 
                        logger.error(f"Forward task error: {e}")
                
                audio_task = asyncio.create_task(forward())
                
                async with httpx.AsyncClient() as client:
                    # Different approach based on whether tools are enabled
                    if use_functions:
                        # NON-STREAMING when tools enabled - Groq is fast (~200ms)
                        # This lets us cleanly detect tool calls without speaking garbage
                        llm_payload = {
                            "model": "llama-3.1-8b-instant",
                            "messages": messages,
                            "max_tokens": 300,
                            "stream": False,
                            "tools": BOOKING_FUNCTIONS,
                            "tool_choice": "auto"
                        }
                        
                        resp = await client.post(
                            "https://api.groq.com/openai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                            json=llm_payload,
                            timeout=30.0
                        )
                        result = resp.json()
                        choice = result.get("choices", [{}])[0]
                        message = choice.get("message", {})
                        
                        if message.get("tool_calls") and not stop_tts:
                            # Tool call - execute it
                            tc = message["tool_calls"][0]
                            tool_name = tc["function"]["name"]
                            tool_args = tc["function"]["arguments"]
                            tool_id = tc["id"]
                            
                            logger.info(f"Tool call: {tool_name}")
                            
                            # Say natural phrase
                            phrases = {
                                "check_availability": "Let me check our availability for you.",
                                "create_booking": "Perfect, let me book that for you right now."
                            }
                            phrase = phrases.get(tool_name, "One moment.")
                            await tts.send(json.dumps({"text": phrase + " ", "try_trigger_generation": True}))
                            
                            # Execute function
                            args = json.loads(tool_args) if tool_args else {}
                            func_result = await execute_function(tool_name, args, cal_service, cal_event_type_id)
                            
                            # Second LLM call (STREAMING) to verbalize result
                            tool_messages = messages + [
                                {"role": "assistant", "content": None, "tool_calls": [{"id": tool_id, "type": "function", "function": {"name": tool_name, "arguments": tool_args}}]},
                                {"role": "tool", "tool_call_id": tool_id, "content": func_result}
                            ]
                            
                            async with client.stream(
                                "POST",
                                "https://api.groq.com/openai/v1/chat/completions",
                                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                                json={"model": "llama-3.1-8b-instant", "messages": tool_messages, "max_tokens": 200, "stream": True},
                                timeout=30.0
                            ) as resp2:
                                buf = ""
                                async for line in resp2.aiter_lines():
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
                        else:
                            # Regular response - send to TTS
                            content = message.get("content", "")
                            if content and not stop_tts:
                                full_response = content
                                await tts.send(json.dumps({"text": content, "try_trigger_generation": True}))
                    
                    else:
                        # NO tools - use STREAMING for lowest latency
                        llm_payload = {
                            "model": "llama-3.1-8b-instant",
                            "messages": messages,
                            "max_tokens": 300,
                            "stream": True
                        }
                        
                        async with client.stream(
                            "POST",
                            "https://api.groq.com/openai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                            json=llm_payload,
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
        state["is_speaking"] = False
    
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
            state["processing_lock"] = False
            pending_process = None
            
            async def process():
                nonlocal transcript_buffer, pending_process, stop_tts
                
                msg = transcript_buffer.strip()
                if not msg or should_stop:
                    return
                
                process_start = time.time()
                transcript_buffer = ""
                stop_tts = False  # Reset for new response
                
                try:
                    await websocket.send_json({"type": "status", "status": "speaking"})
                    await respond(msg, process_start)
                    if not should_stop:
                        await websocket.send_json({"type": "status", "status": "listening"})
                except Exception as e:
                    logger.error(f"Process error: {e}")
            
            async def handle_dg():
                nonlocal transcript_buffer, should_stop, last_transcript_time, pending_process, stop_tts
                
                current_utterance = ""
                last_process_time = 0
                session_start = time.time()
                
                def ts():
                    return f"[{(time.time() - session_start)*1000:.0f}ms]"
                
                try:
                    async for msg in dg:
                        if should_stop: break
                        
                        data = json.loads(msg)
                        msg_type = data.get("type")
                        
                        if msg_type == "Results":
                            alt = data.get("channel", {}).get("alternatives", [{}])[0]
                            t = alt.get("transcript", "")
                            is_final = data.get("is_final", False)
                            speech_final = data.get("speech_final", False)
                            
                            if not t or not is_final:
                                continue
                            
                            current_utterance += " " + t
                            last_transcript_time = time.time()
                            word_count = len(current_utterance.split())
                            logger.info(f"{ts()} Got ({word_count}w, sf={speech_final}): {current_utterance.strip()[:50]}...")
                            
                            # Only process when speech_final is True (user paused)
                            # This prevents cutting off mid-sentence
                            if speech_final and word_count >= 4:
                                # Prevent rapid re-processing
                                if time.time() - last_process_time < 0.5:
                                    continue
                                
                                interrupt_time = time.time()
                                logger.info(f"{ts()} >>> PROCESSING (speech_final=True)")
                                last_process_time = time.time()
                                
                                # ALWAYS stop any current/pending response
                                stop_tts = True
                                state["audio_playing_until"] = 0
                                await websocket.send_json({"type": "interrupt"})  # Stop frontend audio
                                
                                # Cancel pending process
                                if pending_process and not pending_process.done():
                                    pending_process.cancel()
                                
                                logger.info(f"{ts()} >>> Starting new response")
                                
                                # Set transcript and process
                                transcript_buffer = current_utterance.strip()
                                current_utterance = ""
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
