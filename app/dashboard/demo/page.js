'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Phone, PhoneOff, Loader2, Mic, Volume2 } from 'lucide-react'

export default function AgentDemoPage() {
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const [isCallActive, setIsCallActive] = useState(false)
  const [status, setStatus] = useState('idle') // idle, connecting, listening, processing, speaking
  const [transcript, setTranscript] = useState('')
  const [aiText, setAiText] = useState('')
  const [callDuration, setCallDuration] = useState(0)

  // Refs
  const wsRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const callTimerRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)

  useEffect(() => {
    fetchAgents()
    return () => cleanup()
  }, [])

  const cleanup = useCallback(() => {
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    if (wsRef.current) {
      try { 
        wsRef.current.send(JSON.stringify({ type: 'stop' }))
        wsRef.current.close() 
      } catch(e) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch(e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
    }
    audioQueueRef.current = []
    isPlayingRef.current = false
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

    setStatus('connecting')
    setTranscript('')
    setAiText('')
    
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
      streamRef.current = stream
      
      // Initialize audio context for playback
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      
      setIsCallActive(true)
      setCallDuration(0)
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)
      
      // Connect to real-time streaming endpoint
      await connectRealtime(stream)
      
    } catch (e) {
      console.error('Failed to start call:', e)
      toast.error('Could not access microphone')
      cleanup()
      setIsCallActive(false)
      setStatus('idle')
    }
  }

  const connectRealtime = async (stream) => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsHost = window.location.host
    const wsUrl = `${wsProtocol}//${wsHost}/api/ws/realtime`
    
    console.log('Connecting to realtime endpoint:', wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    
    ws.onopen = () => {
      console.log('WebSocket opened, sending config...')
      // Send agent config
      ws.send(JSON.stringify({
        voiceId: selectedAgent.voiceId || 'EXAVITQu4vr4xnSDxMaL',
        systemPrompt: selectedAgent.customPrompt || selectedAgent.systemPrompt || 'You are a helpful assistant. Be concise.',
        initialMessage: selectedAgent.initialMessage || 'Hello! How can I help you?'
      }))
    }
    
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        
        switch (data.type) {
          case 'connected':
            console.log('Connected to realtime service')
            toast.success('Connected!')
            startAudioStreaming(stream, ws)
            break
            
          case 'status':
            setStatus(data.status)
            break
            
          case 'transcript':
            setTranscript(data.text)
            break
            
          case 'user_message':
            console.log('User said:', data.content)
            setTranscript('')
            break
            
          case 'text':
            if (data.partial) {
              setAiText(prev => prev + data.content)
            } else {
              // Full response complete
              setAiText('')
            }
            break
            
          case 'audio':
            // Queue audio chunk for playback
            const audioData = base64ToArrayBuffer(data.data)
            playAudioChunk(audioData)
            break
            
          case 'audio_end':
            console.log('Audio stream ended')
            break
            
          case 'error':
            console.error('Server error:', data.message)
            toast.error(data.message)
            break
        }
      } catch (e) {
        console.error('Message parse error:', e)
      }
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      toast.error('Connection error')
    }
    
    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code)
      if (event.code !== 1000) {
        toast.error('Connection lost')
      }
    }
  }

  const startAudioStreaming = (stream, ws) => {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    
    const mediaRecorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = mediaRecorder
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        const arrayBuffer = await event.data.arrayBuffer()
        ws.send(arrayBuffer)
      }
    }
    
    // Stream audio every 100ms for low latency
    mediaRecorder.start(100)
    console.log('Started streaming audio')
  }

  const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  const playAudioChunk = async (arrayBuffer) => {
    if (!audioContextRef.current) return
    
    // Queue the audio chunk
    audioQueueRef.current.push(arrayBuffer)
    
    // If not currently playing, start playing
    if (!isPlayingRef.current) {
      playNextChunk()
    }
  }

  const playNextChunk = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      return
    }
    
    isPlayingRef.current = true
    const chunk = audioQueueRef.current.shift()
    
    try {
      // Decode and play the audio chunk
      const audioBuffer = await audioContextRef.current.decodeAudioData(chunk.slice(0))
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)
      
      source.onended = () => {
        playNextChunk()
      }
      
      source.start(0)
    } catch (e) {
      // MP3 chunks might not decode individually, accumulate them
      console.log('Chunk decode issue, continuing...')
      playNextChunk()
    }
  }

  const endCall = () => {
    cleanup()
    setIsCallActive(false)
    setStatus('idle')
    setTranscript('')
    setAiText('')
    toast.info(`Call ended`)
  }

  const formatDuration = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col items-center justify-center p-4">
      {/* Agent selector */}
      {!isCallActive && agents.length > 0 && (
        <div className="mb-8 flex gap-2 flex-wrap justify-center">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                selectedAgent?.id === agent.id 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {agent.name}
            </button>
          ))}
        </div>
      )}

      {/* Status indicator */}
      {isCallActive && (
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            {status === 'listening' && <Mic className="w-5 h-5 text-green-400 animate-pulse" />}
            {status === 'processing' && <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />}
            {status === 'speaking' && <Volume2 className="w-5 h-5 text-blue-400 animate-pulse" />}
            {status === 'connecting' && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
            <span className="text-white font-medium capitalize">{status}</span>
          </div>
          <span className="text-gray-400 font-mono">{formatDuration(callDuration)}</span>
        </div>
      )}

      {/* Live transcript */}
      {transcript && (
        <div className="mb-4 max-w-md text-center">
          <p className="text-green-400 text-lg italic">"{transcript}"</p>
        </div>
      )}

      {/* AI response (streaming) */}
      {aiText && (
        <div className="mb-4 max-w-md text-center">
          <p className="text-blue-400 text-lg">{aiText}<span className="animate-pulse">▊</span></p>
        </div>
      )}

      {/* Call button */}
      <div className="relative">
        {!isCallActive ? (
          <button
            onClick={startCall}
            disabled={!selectedAgent}
            className="w-32 h-32 rounded-full bg-green-500 hover:bg-green-400 shadow-lg shadow-green-500/30 hover:shadow-green-400/50 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Phone className="w-12 h-12 text-white" />
          </button>
        ) : (
          <button
            onClick={endCall}
            className="w-32 h-32 rounded-full bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 transition-all flex items-center justify-center"
          >
            <PhoneOff className="w-12 h-12 text-white" />
          </button>
        )}
        
        {/* Ripple effect when listening */}
        {status === 'listening' && (
          <>
            <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-20" />
            <div className="absolute inset-0 rounded-full border-2 border-green-400 animate-pulse opacity-40" />
          </>
        )}
      </div>

      <p className="mt-6 text-gray-500 text-sm">
        {isCallActive ? 'Tap to end call' : 'Tap to start'}
      </p>

      {/* Streaming indicator */}
      {isCallActive && (
        <div className="mt-4 text-xs text-gray-600">
          Real-time streaming: Deepgram → OpenAI → ElevenLabs
        </div>
      )}
    </div>
  )
}
