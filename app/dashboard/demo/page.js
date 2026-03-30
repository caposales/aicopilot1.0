'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Phone, PhoneOff, Loader2, Mic, Volume2, AlertCircle } from 'lucide-react'

export default function AgentDemoPage() {
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const [isCallActive, setIsCallActive] = useState(false)
  const [status, setStatus] = useState('idle') // idle, connecting, listening, processing, speaking
  const [transcript, setTranscript] = useState('')
  const [conversation, setConversation] = useState([])
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState(null)

  // Refs
  const deepgramSocketRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const callTimerRef = useRef(null)
  const currentAudioRef = useRef(null)
  const isProcessingRef = useRef(false)
  const transcriptBufferRef = useRef('')
  const silenceTimeoutRef = useRef(null)
  const statusRef = useRef('idle') // Mirror status in ref for callbacks

  // Keep statusRef in sync
  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    fetchAgents()
    return () => cleanup()
  }, [])

  const cleanup = useCallback(() => {
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
    if (deepgramSocketRef.current) {
      try { deepgramSocketRef.current.close() } catch(e) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch(e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    isProcessingRef.current = false
    transcriptBufferRef.current = ''
  }, [])

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents', { headers: getAuthHeaders() })
      const data = await res.json()
      setAgents(data.agents || [])
      if (data.agents?.length > 0) setSelectedAgent(data.agents[0])
    } catch (e) {
      console.error('Failed to fetch agents:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const startCall = async () => {
    if (!selectedAgent) {
      toast.error('Select an agent first')
      return
    }

    setError(null)
    setStatus('connecting')
    
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      streamRef.current = stream
      
      setIsCallActive(true)
      setConversation([])
      setCallDuration(0)
      
      // Start call timer
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)
      
      // Get Deepgram token and connect
      await connectToDeepgram(stream)
      
    } catch (e) {
      console.error('Failed to start call:', e)
      setError(e.message || 'Could not access microphone')
      toast.error('Could not access microphone')
      cleanup()
      setIsCallActive(false)
      setStatus('idle')
    }
  }

  const connectToDeepgram = async (stream) => {
    try {
      // Get Deepgram API key from our backend
      const tokenRes = await fetch('/api/demo/deepgram-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      })
      
      if (!tokenRes.ok) {
        const err = await tokenRes.json()
        throw new Error(err.error || 'Failed to get Deepgram token')
      }
      
      const { token } = await tokenRes.json()
      console.log('Got Deepgram token, connecting...')
      
      // Connect to Deepgram WebSocket
      // Use audio/webm encoding since MediaRecorder outputs webm
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=true&endpointing=300&vad_events=true`
      
      const ws = new WebSocket(wsUrl, ['token', token])
      deepgramSocketRef.current = ws
      
      ws.onopen = () => {
        console.log('Connected to Deepgram WebSocket')
        setStatus('speaking')
        
        // Play greeting first
        playGreeting().then(() => {
          // Start streaming audio after greeting
          startAudioStreaming(stream, ws)
        })
      }
      
      ws.onmessage = (event) => {
        handleDeepgramMessage(event.data)
      }
      
      ws.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error)
        setError('Connection error - check console for details')
      }
      
      ws.onclose = (event) => {
        console.log('Deepgram WebSocket closed:', event.code, event.reason)
        if (event.code !== 1000 && statusRef.current !== 'idle') {
          setError(`Connection closed: ${event.reason || 'Unknown reason'}`)
        }
      }
      
    } catch (e) {
      console.error('Deepgram connection error:', e)
      throw e
    }
  }

  const playGreeting = async () => {
    const greeting = selectedAgent.initialMessage || "Hello! How can I help you today?"
    setConversation([{ role: 'assistant', content: greeting }])
    
    try {
      // Get TTS audio for greeting
      const ttsRes = await fetch('/api/demo/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ agentId: selectedAgent.id, text: greeting })
      })
      const ttsData = await ttsRes.json()
      
      if (ttsData.audioUrl) {
        await playAudioAndWait(ttsData.audioUrl)
      } else {
        // Fallback to browser TTS
        await speakBrowser(greeting)
      }
    } catch (e) {
      console.error('Greeting TTS error:', e)
      // Continue without audio
    }
  }

  const startAudioStreaming = (stream, ws) => {
    setStatus('listening')
    console.log('Starting audio streaming to Deepgram...')
    
    // Use MediaRecorder for audio capture - simpler and more reliable
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' 
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'
    
    console.log('Using mime type:', mimeType)
    
    const mediaRecorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = mediaRecorder
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        // Don't send while speaking or processing
        if (statusRef.current === 'speaking' || isProcessingRef.current) {
          return
        }
        
        // Send audio data to Deepgram
        const arrayBuffer = await event.data.arrayBuffer()
        ws.send(arrayBuffer)
      }
    }
    
    mediaRecorder.onerror = (e) => {
      console.error('MediaRecorder error:', e)
    }
    
    // Request data every 250ms for low latency
    mediaRecorder.start(250)
    console.log('MediaRecorder started, sending audio chunks every 250ms')
  }

  const handleDeepgramMessage = (data) => {
    try {
      const result = JSON.parse(data)
      
      // Handle different message types
      if (result.type === 'Results') {
        const alt = result.channel?.alternatives?.[0]
        if (alt) {
          const transcript = alt.transcript
          const isFinal = result.is_final
          const speechFinal = result.speech_final
          
          console.log('Deepgram result:', { transcript, isFinal, speechFinal })
          
          if (transcript) {
            if (isFinal) {
              // Accumulate final transcripts
              transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + transcript
              setTranscript(transcriptBufferRef.current)
              
              // Clear any existing silence timeout
              if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current)
              }
              
              // Set timeout to process after brief pause
              silenceTimeoutRef.current = setTimeout(() => {
                if (transcriptBufferRef.current.trim() && !isProcessingRef.current) {
                  processUserMessage(transcriptBufferRef.current.trim())
                  transcriptBufferRef.current = ''
                  setTranscript('')
                }
              }, 1000) // 1s silence = user finished
              
            } else {
              // Show interim transcript
              setTranscript(transcriptBufferRef.current + (transcriptBufferRef.current ? ' ' : '') + transcript)
            }
          }
          
          // Speech final means Deepgram detected end of utterance
          if (speechFinal && transcriptBufferRef.current.trim()) {
            console.log('Speech final detected, processing...')
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current)
            }
            
            if (!isProcessingRef.current) {
              const message = transcriptBufferRef.current.trim()
              transcriptBufferRef.current = ''
              setTranscript('')
              processUserMessage(message)
            }
          }
        }
      } else if (result.type === 'SpeechStarted') {
        console.log('Speech started detected')
      } else if (result.type === 'UtteranceEnd') {
        console.log('Utterance end detected')
        if (transcriptBufferRef.current.trim() && !isProcessingRef.current) {
          const message = transcriptBufferRef.current.trim()
          transcriptBufferRef.current = ''
          setTranscript('')
          processUserMessage(message)
        }
      }
    } catch (e) {
      console.error('Error parsing Deepgram message:', e, data)
    }
  }

  const processUserMessage = async (message) => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    
    console.log('Processing user message:', message)
    setStatus('processing')
    setConversation(prev => [...prev, { role: 'user', content: message }])
    
    try {
      // Get AI response
      const res = await fetch('/api/demo/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message,
          conversation: conversation.slice(-8)
        })
      })
      
      const data = await res.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      const reply = data.reply
      console.log('AI reply:', reply)
      setConversation(prev => [...prev, { role: 'assistant', content: reply }])
      
      // Speak the response
      setStatus('speaking')
      
      // Get TTS audio
      const ttsRes = await fetch('/api/demo/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ agentId: selectedAgent.id, text: reply })
      })
      
      const ttsData = await ttsRes.json()
      
      if (ttsData.audioUrl) {
        await playAudioAndWait(ttsData.audioUrl)
      } else {
        await speakBrowser(reply)
      }
      
      // Resume listening
      setStatus('listening')
      
    } catch (e) {
      console.error('Process error:', e)
      toast.error('Error processing message')
      setStatus('listening')
    } finally {
      isProcessingRef.current = false
    }
  }

  const playAudioAndWait = (url) => {
    return new Promise((resolve) => {
      const audio = new Audio(url)
      currentAudioRef.current = audio
      
      audio.onended = () => {
        currentAudioRef.current = null
        resolve()
      }
      audio.onerror = () => {
        currentAudioRef.current = null
        resolve()
      }
      audio.play().catch(() => resolve())
    })
  }

  const speakBrowser = (text) => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve()
        return
      }
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.onend = resolve
      utterance.onerror = resolve
      speechSynthesis.speak(utterance)
    })
  }

  const endCall = () => {
    cleanup()
    setIsCallActive(false)
    setStatus('idle')
    setTranscript('')
    toast.info(`Call ended - ${formatDuration(callDuration)}`)
  }

  const formatDuration = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`

  const getStatusInfo = () => {
    switch(status) {
      case 'connecting': return { color: 'bg-yellow-500', text: 'Connecting...', icon: <Loader2 className="w-4 h-4 animate-spin" /> }
      case 'listening': return { color: 'bg-green-500', text: 'Listening', icon: <Mic className="w-4 h-4" /> }
      case 'processing': return { color: 'bg-yellow-500', text: 'Thinking', icon: <Loader2 className="w-4 h-4 animate-spin" /> }
      case 'speaking': return { color: 'bg-blue-500', text: 'Speaking', icon: <Volume2 className="w-4 h-4" /> }
      default: return { color: 'bg-gray-400', text: 'Ready', icon: null }
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin" /></div>
  }

  const statusInfo = getStatusInfo()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Test Your Agent</h1>
        <p className="text-muted-foreground">Real-time voice conversation using Deepgram STT + OpenAI + ElevenLabs</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-lg">Select Agent</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {agents.length === 0 ? (
              <Button size="sm" onClick={() => window.location.href = '/dashboard/agents/inbound'}>Create Agent</Button>
            ) : agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => !isCallActive && setSelectedAgent(agent)}
                className={`p-3 rounded-lg border-2 cursor-pointer transition ${
                  selectedAgent?.id === agent.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                } ${isCallActive ? 'opacity-50 pointer-events-none' : ''}`}
                data-testid={`agent-card-${agent.id}`}
              >
                <p className="font-medium">{agent.name}</p>
                <p className="text-xs text-muted-foreground">{agent.voiceId ? 'ElevenLabs Voice' : 'Browser Voice'}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Live Agent Test
              </CardTitle>
              {isCallActive && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100">
                    <div className={`w-2 h-2 rounded-full ${statusInfo.color} animate-pulse`} />
                    {statusInfo.icon}
                    <span className="text-sm font-medium">{statusInfo.text}</span>
                  </div>
                  <Badge variant="outline" className="font-mono">{formatDuration(callDuration)}</Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Conversation */}
            <div className="h-72 overflow-y-auto border rounded-lg p-4 bg-gradient-to-b from-gray-50 to-white mb-4 space-y-3" data-testid="conversation-container">
              {conversation.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
                    <Phone className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="font-medium">Start a test call</p>
                  <p className="text-sm">Talk to your agent like a real customer would</p>
                </div>
              ) : conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2 rounded-2xl ${
                    msg.role === 'user' 
                      ? 'bg-blue-500 text-white rounded-br-sm' 
                      : 'bg-white border shadow-sm rounded-bl-sm'
                  }`}>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
              {status === 'processing' && (
                <div className="flex justify-start">
                  <div className="bg-white border shadow-sm px-4 py-2 rounded-2xl rounded-bl-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live transcript */}
            {(status === 'listening' || transcript) && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Mic className="w-5 h-5 text-green-600" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-ping" />
                  </div>
                  <span className="text-sm text-green-700 flex-1">
                    {transcript || 'Listening... speak now'}
                  </span>
                </div>
              </div>
            )}

            {/* Call button */}
            <div className="flex flex-col items-center gap-3">
              {!isCallActive ? (
                <Button
                  size="lg"
                  className="rounded-full w-24 h-24 bg-green-500 hover:bg-green-600 shadow-lg hover:shadow-xl transition-all"
                  onClick={startCall}
                  disabled={!selectedAgent}
                  data-testid="start-call-btn"
                >
                  <Phone className="w-10 h-10" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-full w-24 h-24 shadow-lg"
                  onClick={endCall}
                  data-testid="end-call-btn"
                >
                  <PhoneOff className="w-10 h-10" />
                </Button>
              )}
              <p className="text-sm text-gray-500">
                {isCallActive ? 'Click to end call' : 'Click to start test call'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
