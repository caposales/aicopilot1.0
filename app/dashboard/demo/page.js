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
  const [status, setStatus] = useState('idle')
  const [callDuration, setCallDuration] = useState(0)

  // Refs
  const wsRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const callTimerRef = useRef(null)
  const audioContextRef = useRef(null)
  const nextPlayTimeRef = useRef(0)

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
    nextPlayTimeRef.current = 0
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
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
      streamRef.current = stream
      
      // Initialize audio context for PCM playback
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 })
      nextPlayTimeRef.current = 0
      
      setIsCallActive(true)
      setCallDuration(0)
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)
      
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
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        voiceId: selectedAgent.voiceId || 'EXAVITQu4vr4xnSDxMaL',
        systemPrompt: selectedAgent.customPrompt || selectedAgent.systemPrompt || 'You are a helpful assistant. Be very concise - 1-2 sentences max.',
        initialMessage: selectedAgent.initialMessage || 'Hello! How can I help you?'
      }))
    }
    
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        
        switch (data.type) {
          case 'connected':
            toast.success('Connected!')
            startAudioStreaming(stream, ws)
            break
            
          case 'status':
            setStatus(data.status)
            break
            
          case 'audio':
            // Play PCM audio immediately
            playPCMAudio(data.data)
            break
            
          case 'audio_end':
            // Audio finished
            break
            
          case 'error':
            toast.error(data.message)
            break
        }
      } catch (e) {
        console.error('Message error:', e)
      }
    }
    
    ws.onerror = () => toast.error('Connection error')
    ws.onclose = (e) => { if (e.code !== 1000) toast.error('Connection lost') }
  }

  const startAudioStreaming = (stream, ws) => {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    
    const mediaRecorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = mediaRecorder
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(await event.data.arrayBuffer())
      }
    }
    
    // Stream every 100ms
    mediaRecorder.start(100)
  }

  const playPCMAudio = (base64Data) => {
    if (!audioContextRef.current) return
    
    const ctx = audioContextRef.current
    
    // Decode base64 to PCM bytes
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    // Convert to Int16 samples
    const int16 = new Int16Array(bytes.buffer)
    
    // Convert to Float32 for Web Audio API
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0
    }
    
    // Create audio buffer
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000)
    audioBuffer.getChannelData(0).set(float32)
    
    // Schedule playback
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    
    // Calculate when to play this chunk
    const currentTime = ctx.currentTime
    const startTime = Math.max(currentTime, nextPlayTimeRef.current)
    
    source.start(startTime)
    nextPlayTimeRef.current = startTime + audioBuffer.duration
  }

  const endCall = () => {
    cleanup()
    setIsCallActive(false)
    setStatus('idle')
  }

  const formatDuration = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col items-center justify-center p-4">
      {/* Agent selector - minimal */}
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

      {/* Simple status */}
      {isCallActive && (
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            {status === 'listening' && <Mic className="w-6 h-6 text-green-400 animate-pulse" />}
            {status === 'speaking' && <Volume2 className="w-6 h-6 text-blue-400 animate-pulse" />}
            {status === 'connecting' && <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />}
          </div>
          <span className="text-gray-400 font-mono text-sm">{formatDuration(callDuration)}</span>
        </div>
      )}

      {/* Call button */}
      <div className="relative">
        {!isCallActive ? (
          <button
            onClick={startCall}
            disabled={!selectedAgent}
            className="w-36 h-36 rounded-full bg-green-500 hover:bg-green-400 shadow-lg shadow-green-500/30 hover:shadow-green-400/50 transition-all flex items-center justify-center disabled:opacity-50"
          >
            <Phone className="w-14 h-14 text-white" />
          </button>
        ) : (
          <button
            onClick={endCall}
            className="w-36 h-36 rounded-full bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 transition-all flex items-center justify-center"
          >
            <PhoneOff className="w-14 h-14 text-white" />
          </button>
        )}
        
        {status === 'listening' && (
          <>
            <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-20" />
            <div className="absolute inset-0 rounded-full border-2 border-green-400 animate-pulse opacity-40" />
          </>
        )}
      </div>

      <p className="mt-6 text-gray-500 text-sm">
        {isCallActive ? 'Tap to end' : 'Tap to call'}
      </p>
    </div>
  )
}
