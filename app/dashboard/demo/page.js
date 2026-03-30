'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  Loader2,
  Sparkles,
  CreditCard
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function AgentDemoPage() {
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  
  // Call state
  const [isCallActive, setIsCallActive] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [conversation, setConversation] = useState([])
  const [callDuration, setCallDuration] = useState(0)
  const [status, setStatus] = useState('idle')
  
  // Paywall
  const [showPaywall, setShowPaywall] = useState(false)
  const [hasFullAccess, setHasFullAccess] = useState(false)
  const [demoMinutesUsed, setDemoMinutesUsed] = useState(0)
  const FREE_DEMO_MINUTES = 2

  // Refs
  const audioRef = useRef(null)
  const recognitionRef = useRef(null)
  const callTimerRef = useRef(null)

  useEffect(() => {
    fetchAgents()
    checkDemoAccess()
    return () => cleanup()
  }, [])

  const cleanup = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch(e) {}
    }
    if (audioRef.current) {
      try { audioRef.current.pause() } catch(e) {}
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
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
      if (data.agents?.length > 0) {
        setSelectedAgent(data.agents[0])
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const checkDemoAccess = async () => {
    try {
      const res = await fetch('/api/demo/access', { headers: getAuthHeaders() })
      const data = await res.json()
      setHasFullAccess(data.hasFullAccess || false)
      setDemoMinutesUsed(data.minutesUsed || 0)
    } catch (error) {
      console.error('Failed to check demo access:', error)
    }
  }

  // Start the call
  const startCall = async () => {
    if (!selectedAgent) {
      toast.error('Please select an agent first')
      return
    }

    if (demoMinutesUsed >= FREE_DEMO_MINUTES && !hasFullAccess) {
      setShowPaywall(true)
      return
    }

    setIsCallActive(true)
    setConversation([])
    setCallDuration(0)
    setStatus('speaking')
    
    // Start timer
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)

    // Get greeting with TTS
    try {
      const res = await fetch('/api/demo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message: '__greeting__',
          isGreeting: true
        })
      })
      const data = await res.json()
      
      setConversation([{ role: 'assistant', content: data.reply }])
      
      if (data.audioUrl) {
        await playAudio(data.audioUrl)
      } else {
        await speakBrowser(data.reply)
      }
      
      // Start listening after greeting
      startListening()
      
    } catch (e) {
      toast.error('Failed to start demo')
      endCall()
    }
  }

  const endCall = () => {
    cleanup()
    setIsCallActive(false)
    setIsListening(false)
    setIsSpeaking(false)
    setIsProcessing(false)
    setStatus('idle')
    setTranscript('')
    toast.info(`Call ended - ${formatDuration(callDuration)}`)
  }

  // Speech Recognition
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error('Speech recognition not supported. Try Chrome or Edge.')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
      setStatus('listening')
      setTranscript('')
    }

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalText += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }
      
      setTranscript(finalText || interimText)
      
      // If we have a final result, send it
      if (finalText.trim()) {
        sendMessage(finalText.trim())
      }
    }

    recognition.onerror = (event) => {
      console.log('Speech error:', event.error)
      setIsListening(false)
      
      if (event.error === 'no-speech') {
        // Restart if no speech detected
        if (isCallActive) {
          setTimeout(() => startListening(), 500)
        }
      } else if (event.error === 'not-allowed') {
        toast.error('Microphone blocked. Please allow access and try again.')
        endCall()
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      // Auto restart if call is active and not processing
      if (isCallActive && !isProcessing && !isSpeaking) {
        setTimeout(() => startListening(), 300)
      }
    }

    try {
      recognition.start()
    } catch (e) {
      console.error('Failed to start recognition:', e)
      if (isCallActive) {
        setTimeout(() => startListening(), 1000)
      }
    }
  }

  const sendMessage = async (message) => {
    if (!message.trim() || isProcessing) return
    
    // Stop listening
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch(e) {}
    }
    
    setIsListening(false)
    setIsProcessing(true)
    setStatus('processing')
    setTranscript('')
    
    // Add user message
    setConversation(prev => [...prev, { role: 'user', content: message }])
    
    try {
      const res = await fetch('/api/demo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message,
          conversation: conversation.slice(-10)
        })
      })
      
      const data = await res.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      // Add AI response
      setConversation(prev => [...prev, { role: 'assistant', content: data.reply }])
      setDemoMinutesUsed(data.minutesUsed || demoMinutesUsed)
      
      // Speak response
      setStatus('speaking')
      setIsSpeaking(true)
      
      if (data.audioUrl) {
        await playAudio(data.audioUrl)
      } else {
        await speakBrowser(data.reply)
      }
      
      setIsSpeaking(false)
      
      // Resume listening
      if (isCallActive) {
        startListening()
      }
      
    } catch (error) {
      toast.error(error.message || 'Failed to get response')
      setConversation(prev => [...prev, { role: 'assistant', content: 'Sorry, I had an error.' }])
      if (isCallActive) {
        startListening()
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const playAudio = (url) => {
    return new Promise((resolve) => {
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = resolve
      audio.onerror = resolve
      audio.play().catch(resolve)
    })
  }

  const speakBrowser = (text) => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve()
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = resolve
      utterance.onerror = resolve
      speechSynthesis.speak(utterance)
    })
  }

  const formatDuration = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`

  const getStatusColor = () => {
    if (status === 'listening') return 'bg-green-500'
    if (status === 'processing') return 'bg-yellow-500'
    if (status === 'speaking') return 'bg-blue-500'
    return 'bg-gray-400'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Test Your Agent</h1>
        <p className="text-muted-foreground">Have a live voice conversation</p>
      </div>

      <div className="flex items-center gap-4">
        <Badge variant={hasFullAccess ? 'default' : 'secondary'}>
          {hasFullAccess ? 'Full Access' : `${Math.max(0, FREE_DEMO_MINUTES - demoMinutesUsed).toFixed(1)} min left`}
        </Badge>
        {!hasFullAccess && (
          <Button variant="outline" size="sm" onClick={() => setShowPaywall(true)}>
            <CreditCard className="w-4 h-4 mr-2" />Upgrade
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Agent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {agents.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">No agents yet</p>
                <Button size="sm" onClick={() => window.location.href = '/dashboard/agents/inbound'}>
                  Create Agent
                </Button>
              </div>
            ) : (
              agents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => !isCallActive && setSelectedAgent(agent)}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition ${
                    selectedAgent?.id === agent.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  } ${isCallActive ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-xs text-muted-foreground">{agent.agentType}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Call Interface */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Live Demo
              </CardTitle>
              {isCallActive && (
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
                  <span className="text-sm capitalize">{status}</span>
                  <Badge variant="outline">{formatDuration(callDuration)}</Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Conversation */}
            <div className="h-64 overflow-y-auto border rounded-lg p-4 bg-gray-50 mb-4 space-y-3">
              {conversation.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <Phone className="w-10 h-10 mb-2" />
                  <p>Click call to start</p>
                </div>
              ) : (
                conversation.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-lg ${
                      msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white border'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-white border p-3 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Live transcript */}
            {isListening && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-green-600 animate-pulse" />
                  <span className="text-sm text-green-700">{transcript || 'Listening...'}</span>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex justify-center">
              {!isCallActive ? (
                <Button
                  size="lg"
                  className="rounded-full w-20 h-20 bg-green-500 hover:bg-green-600"
                  onClick={startCall}
                  disabled={!selectedAgent || agents.length === 0}
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
            
            <p className="text-center text-xs text-gray-400 mt-4">
              {isCallActive ? 'Speak naturally - pause to send' : 'Click to start voice demo'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Paywall */}
      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade for Full Access</DialogTitle>
            <DialogDescription>Get unlimited voice demos</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-700">Full Access - $29/month</h4>
              <ul className="text-sm text-blue-600 mt-2 space-y-1">
                <li>• Unlimited demos</li>
                <li>• Phone test calls</li>
                <li>• Priority support</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaywall(false)}>Later</Button>
            <Button onClick={() => { toast.info('Coming soon!'); setShowPaywall(false) }}>
              Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
