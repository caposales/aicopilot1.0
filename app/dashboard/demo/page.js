'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Phone, PhoneOff, Loader2, Mic, Volume2, Calendar } from 'lucide-react'

export default function AgentDemoPage() {
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCallActive, setIsCallActive] = useState(false)
  const [status, setStatus] = useState('idle')
  const [callDuration, setCallDuration] = useState(0)
  const [integrationKeys, setIntegrationKeys] = useState(null)

  // Refs
  const wsRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const callTimerRef = useRef(null)
  const audioContextRef = useRef(null)
  const nextPlayTimeRef = useRef(0)
  const isEndingRef = useRef(false)

  useEffect(() => {
    fetchAgents()
    fetchIntegrationKeys()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      forceCleanup()
    }
  }, [])

  const forceCleanup = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
    
    if (wsRef.current) {
      try { 
        wsRef.current.close(1000)
      } catch(e) {}
      wsRef.current = null
    }
    
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop()
      } catch(e) {}
      mediaRecorderRef.current = null
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch(e) {}
      audioContextRef.current = null
    }
  }

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

  const fetchIntegrationKeys = async () => {
    try {
      const res = await fetch('/api/integrations/demo-keys', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setIntegrationKeys(data)
      }
    } catch (e) {
      console.error('Failed to fetch integration keys:', e)
    }
  }

  const startCall = async () => {
    if (!selectedAgent || isEndingRef.current) return
    
    setStatus('connecting')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
      streamRef.current = stream
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 })
      nextPlayTimeRef.current = 0
      
      setIsCallActive(true)
      setCallDuration(0)
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)
      
      connectRealtime(stream)
      
    } catch (e) {
      console.error('Failed to start call:', e)
      toast.error('Could not access microphone')
      forceCleanup()
      setIsCallActive(false)
      setStatus('idle')
    }
  }

  const connectRealtime = (stream) => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsHost = window.location.host
    const wsUrl = `${wsProtocol}//${wsHost}/api/ws/realtime`
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    
    ws.onopen = () => {
      if (isEndingRef.current) {
        ws.close()
        return
      }
      // Send config including Cal.com API key for function calling
      const config = {
        voiceId: selectedAgent.voiceId || 'EXAVITQu4vr4xnSDxMaL',
        systemPrompt: selectedAgent.customPrompt || 'You are a helpful assistant. Be concise - 1 sentence max.',
        initialMessage: selectedAgent.initialMessage || 'Hello!'
      }
      
      // Add Cal.com integration if available
      if (integrationKeys?.calcom) {
        config.calApiKey = integrationKeys.calcom
        config.calEventTypeId = selectedAgent.calEventTypeId || 3305088  // Default to 30 Min Meeting
      }
      
      ws.send(JSON.stringify(config))
    }
    
    ws.onmessage = (event) => {
      if (isEndingRef.current) return
      
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'connected') {
          startAudioStreaming(stream, ws)
        } else if (data.type === 'status') {
          setStatus(data.status)
        } else if (data.type === 'audio') {
          playPCMAudio(data.data)
        } else if (data.type === 'interrupt') {
          // User interrupted - stop all queued audio immediately
          stopAudioPlayback()
        } else if (data.type === 'error') {
          toast.error(data.message)
        }
      } catch (e) {}
    }
    
    ws.onerror = () => {
      if (!isEndingRef.current) toast.error('Connection error')
    }
    
    ws.onclose = () => {
      if (!isEndingRef.current) {
        setIsCallActive(false)
        setStatus('idle')
      }
    }
  }

  const startAudioStreaming = (stream, ws) => {
    if (isEndingRef.current) return
    
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    
    const mediaRecorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = mediaRecorder
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN && !isEndingRef.current) {
        ws.send(await event.data.arrayBuffer())
      }
    }
    
    mediaRecorder.start(100)
  }

  const stopAudioPlayback = () => {
    // Reset the audio scheduling to stop queued audio
    if (audioContextRef.current) {
      const ctx = audioContextRef.current
      // Reset play time to now - this effectively skips all queued audio
      nextPlayTimeRef.current = ctx.currentTime
      
      // Close and recreate audio context for clean slate
      try {
        audioContextRef.current.close()
      } catch(e) {}
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 })
      nextPlayTimeRef.current = 0
    }
  }

  const playPCMAudio = (base64Data) => {
    if (!audioContextRef.current || isEndingRef.current) return
    
    try {
      const ctx = audioContextRef.current
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0
      }
      
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000)
      audioBuffer.getChannelData(0).set(float32)
      
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      
      const currentTime = ctx.currentTime
      const startTime = Math.max(currentTime, nextPlayTimeRef.current)
      source.start(startTime)
      nextPlayTimeRef.current = startTime + audioBuffer.duration
    } catch (e) {
      console.error('Audio play error:', e)
    }
  }

  const endCall = () => {
    console.log('END CALL CLICKED')
    isEndingRef.current = true
    
    // Immediately update UI
    setIsCallActive(false)
    setStatus('idle')
    setCallDuration(0)
    
    // Clean up resources
    forceCleanup()
    
    // Reset ending flag after a short delay
    setTimeout(() => {
      isEndingRef.current = false
    }, 500)
    
    toast.info('Call ended')
  }

  const formatDuration = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>
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

      {/* Status */}
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

      {/* Call buttons */}
      {!isCallActive ? (
        <button
          onClick={startCall}
          disabled={!selectedAgent}
          className="w-36 h-36 rounded-full bg-green-500 hover:bg-green-400 shadow-lg shadow-green-500/30 transition-all flex items-center justify-center disabled:opacity-50"
        >
          <Phone className="w-14 h-14 text-white" />
        </button>
      ) : (
        <button
          type="button"
          onClick={endCall}
          className="w-36 h-36 rounded-full bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 transition-all flex items-center justify-center cursor-pointer"
          style={{ pointerEvents: 'auto' }}
        >
          <PhoneOff className="w-14 h-14 text-white" />
        </button>
      )}

      {status === 'listening' && isCallActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-36 h-36 rounded-full border-4 border-green-400 animate-ping opacity-20" />
        </div>
      )}

      <p className="mt-6 text-gray-500 text-sm">
        {isCallActive ? 'Tap to end' : 'Tap to call'}
      </p>
      
      {/* Cal.com integration indicator */}
      {!isCallActive && integrationKeys?.calcom && (
        <div className="mt-4 flex items-center gap-2 text-green-400 text-xs">
          <Calendar className="w-4 h-4" />
          <span>Cal.com booking enabled</span>
        </div>
      )}
    </div>
  )
}
