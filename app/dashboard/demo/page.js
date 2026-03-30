'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  Loader2,
  MessageSquare,
  Sparkles,
  Lock,
  CreditCard,
  Radio
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
  const [demoMode, setDemoMode] = useState('browser')
  
  // Live conversation state
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [isCallActive, setIsCallActive] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [conversation, setConversation] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [status, setStatus] = useState('idle') // idle, listening, processing, speaking
  
  // Phone demo state
  const [phoneNumber, setPhoneNumber] = useState('')
  
  // Paywall
  const [showPaywall, setShowPaywall] = useState(false)
  const [hasFullAccess, setHasFullAccess] = useState(false)
  const [demoMinutesUsed, setDemoMinutesUsed] = useState(0)
  const FREE_DEMO_MINUTES = 2

  // Refs
  const audioRef = useRef(null)
  const recognitionRef = useRef(null)
  const callTimerRef = useRef(null)
  const conversationRef = useRef([])

  // Keep conversation ref in sync
  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  useEffect(() => {
    fetchAgents()
    checkDemoAccess()
    return () => {
      // Cleanup on unmount
      if (callTimerRef.current) clearInterval(callTimerRef.current)
      if (recognitionRef.current) recognitionRef.current.abort()
      if (audioRef.current) audioRef.current.pause()
    }
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

  // Start live conversation
  const startLiveCall = () => {
    if (!selectedAgent) {
      toast.error('Please select an agent first')
      return
    }

    if (demoMinutesUsed >= FREE_DEMO_MINUTES && !hasFullAccess) {
      setShowPaywall(true)
      return
    }

    setIsCallActive(true)
    setCallDuration(0)
    setConversation([])
    setStatus('listening')
    
    // Start call timer
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)

    // Play greeting and then start listening
    playAgentGreeting()
  }

  const playAgentGreeting = async () => {
    setStatus('speaking')
    const greeting = selectedAgent?.initialMessage || "Hello! How can I help you today?"
    
    // Add greeting to conversation
    setConversation([{ role: 'assistant', content: greeting }])
    
    // Speak the greeting
    await speakText(greeting)
    
    // Start listening after greeting
    startContinuousListening()
  }

  const endLiveCall = () => {
    setIsCallActive(false)
    setStatus('idle')
    setIsListening(false)
    setIsSpeaking(false)
    
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.abort()
    }
    
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    toast.info(`Call ended - Duration: ${formatDuration(callDuration)}`)
  }

  // Continuous listening with auto-restart
  const startContinuousListening = useCallback(() => {
    if (!isCallActive) return
    
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error('Speech recognition not supported')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = false
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = 'en-US'

    recognitionRef.current.onstart = () => {
      setIsListening(true)
      setStatus('listening')
      setTranscript('')
    }

    recognitionRef.current.onresult = (event) => {
      const current = event.resultIndex
      const result = event.results[current]
      const text = result[0].transcript
      setTranscript(text)
      
      if (result.isFinal && text.trim()) {
        handleUserMessage(text.trim())
      }
    }

    recognitionRef.current.onerror = (event) => {
      console.log('Speech recognition error:', event.error)
      if (event.error === 'no-speech' && isCallActive) {
        // No speech detected, restart listening
        setTimeout(() => startContinuousListening(), 100)
      } else if (event.error === 'not-allowed') {
        toast.error('Microphone access denied')
        endLiveCall()
      }
    }

    recognitionRef.current.onend = () => {
      setIsListening(false)
      // Don't restart here - we'll restart after AI response
    }

    try {
      recognitionRef.current.start()
    } catch (e) {
      console.log('Recognition start error:', e)
    }
  }, [isCallActive])

  const handleUserMessage = async (message) => {
    if (!message.trim() || isProcessing) return

    // Stop listening while processing
    if (recognitionRef.current) {
      recognitionRef.current.abort()
    }
    
    setIsListening(false)
    setStatus('processing')
    setIsProcessing(true)
    setTranscript('')

    // Add user message
    const newConversation = [...conversationRef.current, { role: 'user', content: message }]
    setConversation(newConversation)

    try {
      const res = await fetch('/api/demo/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message,
          conversation: newConversation.slice(-10)
        })
      })

      const data = await res.json()
      
      if (data.error) {
        throw new Error(data.error)
      }

      // Add AI response
      setConversation(prev => [...prev, { role: 'assistant', content: data.reply }])
      setDemoMinutesUsed(data.minutesUsed || demoMinutesUsed)

      // Speak the response
      setStatus('speaking')
      if (data.audioUrl) {
        await playAudio(data.audioUrl)
      } else {
        await speakText(data.reply)
      }

      // Resume listening after speaking (if call still active)
      if (isCallActive) {
        startContinuousListening()
      }

    } catch (error) {
      toast.error(error.message || 'Failed to get response')
      setConversation(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error.' }])
      if (isCallActive) {
        startContinuousListening()
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const playAudio = (url) => {
    return new Promise((resolve) => {
      setIsSpeaking(true)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setIsSpeaking(false)
        resolve()
      }
      audio.onerror = () => {
        setIsSpeaking(false)
        resolve()
      }
      audio.play().catch(() => {
        setIsSpeaking(false)
        resolve()
      })
    })
  }

  const speakText = (text) => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        setIsSpeaking(true)
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 1.0
        utterance.pitch = 1.0
        utterance.onend = () => {
          setIsSpeaking(false)
          resolve()
        }
        utterance.onerror = () => {
          setIsSpeaking(false)
          resolve()
        }
        speechSynthesis.speak(utterance)
      } else {
        resolve()
      }
    })
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Phone demo functions
  const startPhoneDemo = async () => {
    if (!selectedAgent) {
      toast.error('Please select an agent first')
      return
    }
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error('Please enter a valid phone number')
      return
    }
    if (!hasFullAccess) {
      setShowPaywall(true)
      return
    }

    try {
      const res = await fetch('/api/demo/call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          phoneNumber: phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber}`
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Demo call initiated!')
    } catch (error) {
      toast.error(error.message || 'Failed to initiate call')
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'listening': return 'bg-green-500'
      case 'processing': return 'bg-yellow-500'
      case 'speaking': return 'bg-blue-500'
      default: return 'bg-gray-400'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'listening': return 'Listening...'
      case 'processing': return 'Thinking...'
      case 'speaking': return 'Speaking...'
      default: return 'Ready'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Test Your Agent</h1>
        <p className="text-muted-foreground mt-1">
          Have a live voice conversation with your AI agent
        </p>
      </div>

      {/* Demo Minutes Badge */}
      <div className="flex items-center gap-4">
        <Badge variant={hasFullAccess ? 'default' : 'secondary'} className="px-3 py-1">
          {hasFullAccess ? (
            <>
              <Sparkles className="w-3 h-3 mr-1" />
              Full Access
            </>
          ) : (
            <>
              <Clock className="w-3 h-3 mr-1" />
              {Math.max(0, FREE_DEMO_MINUTES - demoMinutesUsed).toFixed(1)} free minutes remaining
            </>
          )}
        </Badge>
        {!hasFullAccess && (
          <Button variant="outline" size="sm" onClick={() => setShowPaywall(true)}>
            <CreditCard className="w-4 h-4 mr-2" />
            Upgrade
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Agent</CardTitle>
            <CardDescription>Choose which agent to test</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents created yet. Create an agent first.</p>
            ) : (
              agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedAgent?.id === agent.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-border hover:border-blue-300'
                  } ${isCallActive ? 'pointer-events-none opacity-50' : ''}`}
                  onClick={() => !isCallActive && setSelectedAgent(agent)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{agent.agentType}</p>
                    </div>
                    <Badge variant="outline">{agent.voiceId ? 'Voice' : 'Default'}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Live Call Interface */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Radio className="w-5 h-5" />
                  Live Voice Demo
                </CardTitle>
                <CardDescription>
                  Have a real-time conversation with your agent
                </CardDescription>
              </div>
              {isCallActive && (
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
                  <span className="text-sm font-medium">{getStatusText()}</span>
                  <Badge variant="outline" className="font-mono">
                    {formatDuration(callDuration)}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Conversation Display */}
            <div className="h-72 overflow-y-auto border rounded-lg p-4 bg-gray-50 mb-4 space-y-3">
              {conversation.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Phone className="w-12 h-12 mb-3" />
                  <p className="text-lg font-medium">Start a Live Call</p>
                  <p className="text-sm">Click the call button to begin talking with your agent</p>
                </div>
              ) : (
                conversation.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white border shadow-sm'
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-white border shadow-sm p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live Transcript */}
            {isListening && (
              <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-green-700">
                    {transcript || 'Listening... speak now'}
                  </span>
                </div>
              </div>
            )}

            {/* Call Controls */}
            <div className="flex items-center justify-center gap-6">
              {!isCallActive ? (
                <Button
                  size="lg"
                  className="rounded-full w-20 h-20 bg-green-500 hover:bg-green-600"
                  onClick={startLiveCall}
                  disabled={!selectedAgent || agents.length === 0}
                >
                  <Phone className="w-8 h-8" />
                </Button>
              ) : (
                <>
                  {/* Mute/Unmute (for future) */}
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full w-14 h-14"
                    disabled
                  >
                    {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                  </Button>

                  {/* End Call */}
                  <Button
                    size="lg"
                    variant="destructive"
                    className="rounded-full w-20 h-20"
                    onClick={endLiveCall}
                  >
                    <PhoneOff className="w-8 h-8" />
                  </Button>

                  {/* Speaker (for future) */}
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full w-14 h-14"
                    disabled
                  >
                    {isSpeaking ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                  </Button>
                </>
              )}
            </div>

            <p className="text-center text-xs text-muted-foreground mt-4">
              {!isCallActive 
                ? 'Click the green button to start a live voice conversation' 
                : 'Speak naturally - the agent will respond when you pause'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Paywall Dialog */}
      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              Upgrade to Full Demo Access
            </DialogTitle>
            <DialogDescription>
              Get unlimited voice demos and phone test calls
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium">Free Plan</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {FREE_DEMO_MINUTES} minutes of voice demos</li>
                <li>• Basic agent testing</li>
              </ul>
            </div>
            <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-700">Full Access - $29/month</h4>
              <ul className="text-sm text-blue-600 space-y-1">
                <li>• Unlimited voice demos</li>
                <li>• Phone test calls</li>
                <li>• Full agent flow testing</li>
                <li>• Priority support</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaywall(false)}>
              Maybe Later
            </Button>
            <Button onClick={() => {
              toast.info('Upgrade feature coming soon!')
              setShowPaywall(false)
            }}>
              <CreditCard className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Clock(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
