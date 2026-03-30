'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Phone, PhoneOff, Loader2, Mic } from 'lucide-react'

export default function AgentDemoPage() {
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const [isCallActive, setIsCallActive] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [conversation, setConversation] = useState([])
  const [callDuration, setCallDuration] = useState(0)
  const [status, setStatus] = useState('idle')

  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const callTimerRef = useRef(null)
  const abortControllerRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)

  useEffect(() => {
    fetchAgents()
    return () => cleanup()
  }, [])

  const cleanup = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    if (recognitionRef.current) try { recognitionRef.current.abort() } catch(e) {}
    if (abortControllerRef.current) abortControllerRef.current.abort()
    if (audioContextRef.current) try { audioContextRef.current.close() } catch(e) {}
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

  const startCall = async () => {
    if (!selectedAgent) {
      toast.error('Select an agent first')
      return
    }

    // Initialize audio context
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    
    setIsCallActive(true)
    setConversation([])
    setCallDuration(0)
    
    callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)

    // Play greeting
    setStatus('speaking')
    const greeting = selectedAgent.initialMessage || "Hello! How can I help you today?"
    setConversation([{ role: 'assistant', content: greeting }])
    
    await streamTTS(greeting)
    
    // Start listening
    startListening()
  }

  const endCall = () => {
    cleanup()
    setIsCallActive(false)
    setIsListening(false)
    setIsSpeaking(false)
    setStatus('idle')
    audioQueueRef.current = []
    isPlayingRef.current = false
  }

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error('Speech recognition not supported')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let silenceTimeout = null
    let finalTranscript = ''

    recognition.onstart = () => {
      setIsListening(true)
      setStatus('listening')
      setTranscript('')
      finalTranscript = ''
    }

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
      
      // Set new timeout - send after 1.2s of silence
      if (finalTranscript.trim()) {
        silenceTimeout = setTimeout(() => {
          if (finalTranscript.trim() && isCallActive) {
            const msg = finalTranscript.trim()
            finalTranscript = ''
            setTranscript('')
            recognition.stop()
            processUserInput(msg)
          }
        }, 1200)
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        if (isCallActive && !isSpeaking) recognition.start()
      } else if (event.error !== 'aborted') {
        console.log('Speech error:', event.error)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      if (isCallActive && !isSpeaking && status !== 'processing') {
        setTimeout(() => {
          if (isCallActive && !isSpeaking) {
            try { recognition.start() } catch(e) {}
          }
        }, 300)
      }
    }

    recognition.start()
  }

  const processUserInput = async (message) => {
    setStatus('processing')
    setConversation(prev => [...prev, { role: 'user', content: message }])
    
    try {
      // Get streaming response
      abortControllerRef.current = new AbortController()
      
      const res = await fetch('/api/demo/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message,
          conversation: conversation.slice(-6)
        }),
        signal: abortControllerRef.current.signal
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }

      const data = await res.json()
      
      // Add response to conversation
      setConversation(prev => [...prev, { role: 'assistant', content: data.reply }])
      
      // Stream TTS
      setStatus('speaking')
      setIsSpeaking(true)
      await streamTTS(data.reply)
      setIsSpeaking(false)
      
      // Resume listening
      if (isCallActive) startListening()
      
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Error:', e)
        toast.error('Error getting response')
      }
      if (isCallActive) startListening()
    }
  }

  // Stream TTS using ElevenLabs - faster chunked approach
  const streamTTS = async (text) => {
    setIsSpeaking(true)
    
    try {
      const res = await fetch('/api/demo/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          text
        })
      })

      if (!res.ok) {
        // Fallback to browser TTS
        await browserTTS(text)
        return
      }

      const data = await res.json()
      
      if (data.audioUrl) {
        await playAudio(data.audioUrl)
      } else {
        await browserTTS(text)
      }
    } catch (e) {
      console.error('TTS error:', e)
      await browserTTS(text)
    } finally {
      setIsSpeaking(false)
    }
  }

  const playAudio = (url) => {
    return new Promise((resolve) => {
      const audio = new Audio(url)
      audio.onended = resolve
      audio.onerror = resolve
      audio.play().catch(resolve)
    })
  }

  const browserTTS = (text) => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return }
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.1 // Slightly faster
      u.onend = resolve
      u.onerror = resolve
      speechSynthesis.speak(u)
    })
  }

  const formatDuration = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Test Your Agent</h1>
        <p className="text-muted-foreground">Live voice conversation</p>
      </div>

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
                className={`p-3 rounded-lg border-2 cursor-pointer ${
                  selectedAgent?.id === agent.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                } ${isCallActive ? 'opacity-50' : ''}`}
              >
                <p className="font-medium">{agent.name}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Live Demo</CardTitle>
              {isCallActive && (
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    status === 'listening' ? 'bg-green-500' : 
                    status === 'speaking' ? 'bg-blue-500' : 'bg-yellow-500'
                  }`} />
                  <span className="text-sm capitalize">{status}</span>
                  <Badge variant="outline">{formatDuration(callDuration)}</Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 overflow-y-auto border rounded-lg p-4 bg-gray-50 mb-4 space-y-3">
              {conversation.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <Phone className="w-10 h-10 mb-2" />
                  <p>Click to start</p>
                </div>
              ) : conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg ${
                    msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white border'
                  }`}>{msg.content}</div>
                </div>
              ))}
            </div>

            {isListening && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <Mic className="w-4 h-4 text-green-600 animate-pulse" />
                <span className="text-sm text-green-700">{transcript || 'Listening...'}</span>
              </div>
            )}

            <div className="flex justify-center">
              {!isCallActive ? (
                <Button
                  size="lg"
                  className="rounded-full w-20 h-20 bg-green-500 hover:bg-green-600"
                  onClick={startCall}
                  disabled={!selectedAgent}
                >
                  <Phone className="w-8 h-8" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-full w-20 h-20"
                  onClick={endCall}
                >
                  <PhoneOff className="w-8 h-8" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
