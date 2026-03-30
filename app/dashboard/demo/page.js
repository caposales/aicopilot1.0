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
  const [transcript, setTranscript] = useState('')
  const [callDuration, setCallDuration] = useState(0)

  // Refs
  const deepgramSocketRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const callTimerRef = useRef(null)
  const currentAudioRef = useRef(null)
  const isProcessingRef = useRef(false)
  const transcriptBufferRef = useRef('')
  const silenceTimeoutRef = useRef(null)
  const statusRef = useRef('idle')
  const conversationRef = useRef([])

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
    if (mediaRecorderRef.current) {
      // Could be MediaRecorder or SpeechRecognition
      if (mediaRecorderRef.current.stop) {
        try { mediaRecorderRef.current.stop() } catch(e) {}
      }
      if (mediaRecorderRef.current.abort) {
        try { mediaRecorderRef.current.abort() } catch(e) {}
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    isProcessingRef.current = false
    transcriptBufferRef.current = ''
    conversationRef.current = []
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
      
      setIsCallActive(true)
      setCallDuration(0)
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)
      
      await connectToDeepgram(stream)
      
    } catch (e) {
      console.error('Failed to start call:', e)
      toast.error('Could not access microphone')
      cleanup()
      setIsCallActive(false)
      setStatus('idle')
    }
  }

  const connectToDeepgram = async (stream) => {
    try {
      console.log('Connecting to Deepgram via backend proxy...')
      
      // Connect through our backend WebSocket proxy
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsHost = window.location.host
      const wsUrl = `${wsProtocol}//${wsHost}/api/ws/deepgram`
      
      console.log('WebSocket URL:', wsUrl)
      const ws = new WebSocket(wsUrl)
      deepgramSocketRef.current = ws
      
      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error('WebSocket connection timeout - readyState:', ws.readyState)
          ws.close()
          toast.error('Deepgram connection timeout - using browser fallback')
          useBrowserSpeechRecognition(stream)
        }
      }, 10000)
      
      ws.onopen = () => {
        console.log('WebSocket opened, waiting for Deepgram connection...')
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Check for connection confirmation
          if (data.type === 'connected') {
            clearTimeout(connectionTimeout)
            console.log('Deepgram connected via proxy!')
            toast.success('Connected to Deepgram')
            setStatus('speaking')
            playGreeting().then(() => startAudioStreaming(stream, ws))
            return
          }
          
          // Check for errors
          if (data.error) {
            console.error('Deepgram error:', data.error)
            clearTimeout(connectionTimeout)
            toast.error('Deepgram error - using browser fallback')
            useBrowserSpeechRecognition(stream)
            return
          }
          
          // Handle transcription results
          handleDeepgramMessage(event.data)
        } catch (e) {
          // Not JSON, might be binary or raw message
          handleDeepgramMessage(event.data)
        }
      }
      
      ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error('WebSocket error event:', error)
      }
      
      ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log('WebSocket closed - code:', event.code, 'reason:', event.reason)
        
        if (statusRef.current !== 'idle' && event.code !== 1000) {
          console.error('Connection failed, using browser fallback')
          toast.error('Connection lost - using browser')
          useBrowserSpeechRecognition(stream)
        }
      }
    } catch (e) {
      console.error('Connection setup error:', e)
      toast.error('Setup error - using browser speech recognition')
      useBrowserSpeechRecognition(stream)
    }
  }

  // Fallback: Use browser's built-in speech recognition
  const useBrowserSpeechRecognition = (stream) => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error('Speech recognition not supported in this browser')
      cleanup()
      setIsCallActive(false)
      setStatus('idle')
      return
    }

    console.log('Using browser speech recognition as fallback')
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    
    let finalTranscript = ''
    let silenceTimeout = null
    
    recognition.onresult = (event) => {
      let interim = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' '
        } else {
          interim += event.results[i][0].transcript
        }
      }
      
      setTranscript(finalTranscript + interim)
      
      // Clear existing timeout
      if (silenceTimeout) clearTimeout(silenceTimeout)
      
      // Process after 600ms of silence
      if (finalTranscript.trim()) {
        silenceTimeout = setTimeout(() => {
          if (finalTranscript.trim() && !isProcessingRef.current) {
            const message = finalTranscript.trim()
            finalTranscript = ''
            setTranscript('')
            recognition.stop()
            processMessage(message).then(() => {
              if (statusRef.current !== 'idle') {
                try { recognition.start() } catch(e) {}
              }
            })
          }
        }, 600)
      }
    }
    
    recognition.onerror = (e) => {
      console.log('Speech recognition error:', e.error)
      if (e.error === 'no-speech' && statusRef.current === 'listening') {
        try { recognition.start() } catch(err) {}
      }
    }
    
    recognition.onend = () => {
      if (statusRef.current === 'listening') {
        try { recognition.start() } catch(e) {}
      }
    }
    
    // Store reference for cleanup
    mediaRecorderRef.current = recognition
    
    // Play greeting then start listening
    setStatus('speaking')
    playGreeting().then(() => {
      setStatus('listening')
      recognition.start()
    })
  }

  const playGreeting = async () => {
    const greeting = selectedAgent.initialMessage || "Hello! How can I help you?"
    conversationRef.current = [{ role: 'assistant', content: greeting }]
    await speakWithElevenLabs(greeting)
  }

  const startAudioStreaming = (stream, ws) => {
    setStatus('listening')
    
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    
    const mediaRecorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = mediaRecorder
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        if (statusRef.current === 'speaking' || isProcessingRef.current) return
        ws.send(await event.data.arrayBuffer())
      }
    }
    
    // Faster chunks = lower latency
    mediaRecorder.start(100)
  }

  const handleDeepgramMessage = (data) => {
    try {
      const result = JSON.parse(data)
      
      if (result.type === 'Results' && result.channel?.alternatives?.[0]) {
        const text = result.channel.alternatives[0].transcript
        const isFinal = result.is_final
        
        if (text) {
          if (isFinal) {
            transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + text
            setTranscript(transcriptBufferRef.current)
            
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
            
            // FAST: Only 400ms silence before responding
            silenceTimeoutRef.current = setTimeout(() => {
              if (transcriptBufferRef.current.trim() && !isProcessingRef.current) {
                processMessage(transcriptBufferRef.current.trim())
                transcriptBufferRef.current = ''
                setTranscript('')
              }
            }, 400)
            
          } else {
            setTranscript(transcriptBufferRef.current + ' ' + text)
          }
        }
      } else if (result.type === 'UtteranceEnd') {
        // Deepgram detected end of speech - respond immediately
        if (transcriptBufferRef.current.trim() && !isProcessingRef.current) {
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
          processMessage(transcriptBufferRef.current.trim())
          transcriptBufferRef.current = ''
          setTranscript('')
        }
      }
    } catch (e) {
      console.error('Parse error:', e)
    }
  }

  const processMessage = async (message) => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    
    setStatus('processing')
    conversationRef.current.push({ role: 'user', content: message })
    
    try {
      // Get AI response - use minimal context for speed
      const res = await fetch('/api/demo/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message,
          conversation: conversationRef.current.slice(-4) // Only last 4 messages
        })
      })
      
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      
      const reply = data.reply
      conversationRef.current.push({ role: 'assistant', content: reply })
      
      // Speak using ElevenLabs
      setStatus('speaking')
      await speakWithElevenLabs(reply)
      
      setStatus('listening')
    } catch (e) {
      console.error('Process error:', e)
      setStatus('listening')
    } finally {
      isProcessingRef.current = false
    }
  }

  // Use ElevenLabs TTS for high-quality voice
  const speakWithElevenLabs = async (text) => {
    try {
      const res = await fetch('/api/demo/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ agentId: selectedAgent.id, text })
      })
      
      const data = await res.json()
      
      if (data.audioUrl) {
        await playAudio(data.audioUrl)
      } else {
        // Fallback to browser TTS
        await speakBrowser(text)
      }
    } catch (e) {
      console.error('TTS error:', e)
      await speakBrowser(text)
    }
  }

  const playAudio = (url) => {
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

  // Browser TTS fallback
  const speakBrowser = (text) => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve()
        return
      }
      
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.1 // Slightly faster
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
            <span className="text-white font-medium capitalize">{status}</span>
          </div>
          <span className="text-gray-400 font-mono">{formatDuration(callDuration)}</span>
        </div>
      )}

      {/* Live transcript */}
      {transcript && (
        <div className="mb-6 max-w-md text-center">
          <p className="text-green-400 text-lg italic">"{transcript}"</p>
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
            className="w-32 h-32 rounded-full bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 transition-all flex items-center justify-center animate-pulse"
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
    </div>
  )
}
