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
import time

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI()
NEXTJS_URL = os.environ.get('NEXTJS_URL', 'http://localhost:3000')

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.get("/")
async def health_check():
    return {"status": "ok"}

@app.get("/health")
async def health():
    return {"status": "healthy"}


# =============================================================================
# ULTRA LOW LATENCY REAL-TIME CONVERSATION
# =============================================================================

@app.websocket("/api/ws/realtime")
async def realtime_conversation(websocket: WebSocket):
    await websocket.accept()
    
    deepgram_key = os.environ.get('DEEPGRAM_API_KEY')
    elevenlabs_key = os.environ.get('ELEVENLABS_API_KEY')
    llm_key = os.environ.get('EMERGENT_LLM_KEY')
    
    if not all([deepgram_key, elevenlabs_key, llm_key]):
        await websocket.send_json({"type": "error", "message": "Missing API keys"})
        await websocket.close()
        return
    
    # Get config
    try:
        config_msg = await asyncio.wait_for(websocket.receive_json(), timeout=5)
        voice_id = config_msg.get('voiceId', 'EXAVITQu4vr4xnSDxMaL')
        system_prompt = config_msg.get('systemPrompt', 'You are helpful. Reply in 1 short sentence.')
        initial_message = config_msg.get('initialMessage', 'Hello!')
    except:
        voice_id = 'EXAVITQu4vr4xnSDxMaL'
        system_prompt = 'You are helpful. Reply in 1 short sentence.'
        initial_message = 'Hello!'
    
    # State
    state = {
        'is_speaking': False,
        'should_stop': False,
        'transcript_buffer': '',
        'conversation': [],
        'cooldown_until': 0
    }
    state_lock = asyncio.Lock()
    
    async def stream_tts(text: str):
        """Stream TTS - blocks until complete"""
        async with state_lock:
            state['is_speaking'] = True
        
        try:
            uri = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5"
            
            async with websockets.connect(uri) as tts_ws:
                # BOS
                await tts_ws.send(json.dumps({
                    "text": " ",
                    "output_format": "pcm_24000",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                    "xi_api_key": elevenlabs_key
                }))
                
                # Send text
                await tts_ws.send(json.dumps({"text": text + " ", "try_trigger_generation": True}))
                await tts_ws.send(json.dumps({"text": ""}))  # EOS
                
                # Stream audio to client
                async for msg in tts_ws:
                    if state['should_stop']:
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
            async with state_lock:
                state['is_speaking'] = False
                state['transcript_buffer'] = ''  # Clear any buffered audio
                state['cooldown_until'] = time.time() + 0.3  # 300ms cooldown
    
    async def stream_llm_tts(user_message: str):
        """Stream LLM -> TTS with word-by-word streaming"""
        async with state_lock:
            state['is_speaking'] = True
            state['conversation'].append({"role": "user", "content": user_message})
        
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(state['conversation'][-4:])
        
        full_response = ""
        
        try:
            uri = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5"
            
            async with websockets.connect(uri) as tts_ws:
                # BOS
                await tts_ws.send(json.dumps({
                    "text": " ",
                    "output_format": "pcm_24000", 
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                    "xi_api_key": elevenlabs_key
                }))
                
                # Task to forward audio
                async def forward_audio():
                    try:
                        async for msg in tts_ws:
                            if state['should_stop']:
                                break
                            try:
                                data = json.loads(msg)
                                if data.get("audio"):
                                    await websocket.send_json({"type": "audio", "data": data["audio"]})
                            except:
                                pass
                    except:
                        pass
                
                audio_task = asyncio.create_task(forward_audio())
                
                # Stream LLM
                async with httpx.AsyncClient() as client:
                    async with client.stream(
                        "POST",
                        "https://integrations.emergentagent.com/llm/chat/completions",
                        headers={"Authorization": f"Bearer {llm_key}", "Content-Type": "application/json"},
                        json={"model": "gpt-5.2", "messages": messages, "max_tokens": 80, "stream": True},
                        timeout=30.0
                    ) as response:
                        buffer = ""
                        async for line in response.aiter_lines():
                            if state['should_stop']:
                                break
                            if line.startswith("data: ") and line[6:] != "[DONE]":
                                try:
                                    chunk = json.loads(line[6:])
                                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                    if content:
                                        full_response += content
                                        buffer += content
                                        # Send every word or punctuation
                                        if ' ' in buffer or any(p in buffer for p in '.!?,;:'):
                                            await tts_ws.send(json.dumps({"text": buffer, "try_trigger_generation": True}))
                                            buffer = ""
                                except:
                                    pass
                        
                        if buffer:
                            await tts_ws.send(json.dumps({"text": buffer, "try_trigger_generation": True}))
                
                # EOS
                await tts_ws.send(json.dumps({"text": ""}))
                await asyncio.sleep(0.3)
                audio_task.cancel()
                
                await websocket.send_json({"type": "audio_end"})
        
        except Exception as e:
            logger.error(f"LLM->TTS error: {e}")
        
        async with state_lock:
            state['conversation'].append({"role": "assistant", "content": full_response})
            state['is_speaking'] = False
            state['transcript_buffer'] = ''  # Clear buffer
            state['cooldown_until'] = time.time() + 0.3  # 300ms cooldown after speaking
    
    # Connect to Deepgram
    try:
        async with websockets.connect(
            "wss://api.deepgram.com/v1/listen",
            additional_headers={"Authorization": f"Token {deepgram_key}"}
        ) as deepgram_ws:
            await websocket.send_json({"type": "connected"})
            
            # Initial greeting
            await websocket.send_json({"type": "status", "status": "speaking"})
            await stream_tts(initial_message)
            state['conversation'].append({"role": "assistant", "content": initial_message})
            await websocket.send_json({"type": "status", "status": "listening"})
            
            async def handle_deepgram():
                """Process transcriptions - ignore while speaking + cooldown"""
                response_task = None
                
                async def trigger_response():
                    """Trigger AI response after brief silence"""
                    await asyncio.sleep(0.1)  # 100ms
                    
                    async with state_lock:
                        # Check cooldown
                        if time.time() < state['cooldown_until']:
                            state['transcript_buffer'] = ''
                            return
                        
                        if state['is_speaking']:
                            return
                        
                        message = state['transcript_buffer'].strip()
                        state['transcript_buffer'] = ''
                        
                        # Ignore short noise - must be real speech
                        if len(message) < 5 or len(message.split()) < 2:
                            return
                    
                    await websocket.send_json({"type": "status", "status": "speaking"})
                    await stream_llm_tts(message)
                    
                    if not state['should_stop']:
                        await websocket.send_json({"type": "status", "status": "listening"})
                
                try:
                    async for msg in deepgram_ws:
                        if state['should_stop']:
                            break
                        
                        # Skip while speaking OR during cooldown
                        if state['is_speaking'] or time.time() < state['cooldown_until']:
                            continue
                        
                        data = json.loads(msg)
                        
                        if data.get("type") == "Results":
                            alt = data.get("channel", {}).get("alternatives", [{}])[0]
                            transcript = alt.get("transcript", "")
                            is_final = data.get("is_final", False)
                            speech_final = data.get("speech_final", False)
                            
                            if transcript and is_final:
                                async with state_lock:
                                    state['transcript_buffer'] += " " + transcript
                                
                                if response_task:
                                    response_task.cancel()
                                response_task = asyncio.create_task(trigger_response())
                            
                            if speech_final:
                                if response_task:
                                    response_task.cancel()
                                response_task = asyncio.create_task(trigger_response())
                        
                        elif data.get("type") == "UtteranceEnd":
                            if state['transcript_buffer'].strip():
                                if response_task:
                                    response_task.cancel()
                                response_task = asyncio.create_task(trigger_response())
                
                except Exception as e:
                    logger.error(f"Deepgram error: {e}")
            
            async def handle_client():
                """Forward client audio to Deepgram"""
                try:
                    while not state['should_stop']:
                        msg = await websocket.receive()
                        if msg["type"] == "websocket.receive":
                            if "bytes" in msg:
                                # Only send audio when NOT speaking AND not in cooldown
                                if not state['is_speaking'] and time.time() >= state['cooldown_until']:
                                    await deepgram_ws.send(msg["bytes"])
                            elif "text" in msg:
                                data = json.loads(msg["text"])
                                if data.get("type") == "stop":
                                    state['should_stop'] = True
                                    break
                except WebSocketDisconnect:
                    pass
                except:
                    pass
                finally:
                    state['should_stop'] = True
            
            await asyncio.gather(handle_deepgram(), handle_client(), return_exceptions=True)
    
    except Exception as e:
        logger.error(f"Realtime error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass


# Deepgram proxy (backwards compat)
@app.websocket("/api/ws/deepgram")
async def deepgram_proxy(websocket: WebSocket):
    await websocket.accept()
    
    deepgram_key = os.environ.get('DEEPGRAM_API_KEY')
    if not deepgram_key:
        await websocket.send_json({"error": "No Deepgram key"})
        await websocket.close()
        return
    
    try:
        async with websockets.connect(
            "wss://api.deepgram.com/v1/listen",
            additional_headers={"Authorization": f"Token {deepgram_key}"}
        ) as dg:
            await websocket.send_json({"type": "connected"})
            
            async def to_dg():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await dg.send(data)
                except:
                    pass
            
            async def from_dg():
                try:
                    async for msg in dg:
                        await websocket.send_text(msg)
                except:
                    pass
            
            await asyncio.gather(to_dg(), from_dg(), return_exceptions=True)
    except Exception as e:
        logger.error(f"Deepgram proxy error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass


# Proxy to Next.js
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_to_nextjs(request: Request, path: str):
    target_url = f"{NEXTJS_URL}/api/{path}"
    body = await request.body()
    headers = dict(request.headers)
    headers.pop('host', None)
    
    for attempt in range(3):
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
                return Response(content=response.content, status_code=response.status_code, headers=dict(response.headers))
        except httpx.ConnectError:
            if attempt < 2:
                await asyncio.sleep(2)
            else:
                return JSONResponse(status_code=503, content={"error": "Service unavailable"})
        except Exception as e:
            return JSONResponse(status_code=502, content={"error": str(e)})
    
    return JSONResponse(status_code=503, content={"error": "Service unavailable"})
