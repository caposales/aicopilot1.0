'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [demoMode, setDemoMode] = useState('browser') // 'browser' or 'phone'
  
  // Browser voice chat state
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [conversation, setConversation] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Phone demo state
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isCallActive, setIsCallActive] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  
  // Full demo paywall
  const [showPaywall, setShowPaywall] = useState(false)
  const [hasFullAccess, setHasFullAccess] = useState(false)
  const [demoMinutesUsed, setDemoMinutesUsed] = useState(0)
  const FREE_DEMO_MINUTES = 2

  // Audio refs
  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    fetchAgents()
    checkDemoAccess()
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

  // Browser Voice Chat Functions
  const startListening = () => {
    if (!selectedAgent) {
      toast.error('Please select an agent first')
      return
    }

    // Check demo limits
    if (demoMinutesUsed >= FREE_DEMO_MINUTES && !hasFullAccess) {
      setShowPaywall(true)
      return
    }

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onstart = () => {
        setIsListening(true)
        setTranscript('')
      }

      recognitionRef.current.onresult = (event) => {
        const current = event.resultIndex
        const result = event.results[current]
        setTranscript(result[0].transcript)
        
        if (result.isFinal) {
          handleUserMessage(result[0].transcript)
        }
      }

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
        if (event.error === 'not-allowed') {
          toast.error('Microphone access denied. Please allow microphone access.')
        }
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current.start()
    } else {
      toast.error('Speech recognition not supported in this browser')
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }

  const handleUserMessage = async (message) => {
    if (!message.trim()) return

    // Add user message to conversation
    setConversation(prev => [...prev, { role: 'user', content: message }])
    setIsProcessing(true)

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
          conversation: conversation.slice(-10)
        })
      })

      const data = await res.json()
      
      if (data.error) {
        throw new Error(data.error)
      }

      // Add AI response to conversation
      setConversation(prev => [...prev, { role: 'assistant', content: data.reply }])

      // Speak the response using ElevenLabs TTS
      if (data.audioUrl) {
        playAudio(data.audioUrl)
      } else {
        // Fallback to browser TTS
        speakText(data.reply)
      }

      // Update demo minutes
      setDemoMinutesUsed(data.minutesUsed || demoMinutesUsed)

    } catch (error) {
      toast.error(error.message || 'Failed to get response')
      setConversation(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
    } finally {
      setIsProcessing(false)
    }
  }

  const playAudio = (url) => {
    setIsSpeaking(true)
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => setIsSpeaking(false)
    audio.onerror = () => {
      setIsSpeaking(false)
      toast.error('Failed to play audio')
    }
    audio.play()
  }

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      setIsSpeaking(true)
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = () => setIsSpeaking(false)
      speechSynthesis.speak(utterance)
    }
  }

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }
    setIsSpeaking(false)
  }

  // Phone Demo Functions
  const startPhoneDemo = async () => {
    if (!selectedAgent) {
      toast.error('Please select an agent first')
      return
    }

    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error('Please enter a valid phone number')
      return
    }

    // Check if user has full access for phone demos
    if (!hasFullAccess) {
      setShowPaywall(true)
      return
    }

    setIsCallActive(true)
    setCallDuration(0)

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
      
      if (data.error) {
        throw new Error(data.error)
      }

      toast.success('Demo call initiated! You should receive a call shortly.')

      // Start duration timer
      const timer = setInterval(() => {
        setCallDuration(prev => prev + 1)
      }, 1000)

      // Store timer for cleanup
      audioRef.current = { timer }

    } catch (error) {
      toast.error(error.message || 'Failed to initiate call')
      setIsCallActive(false)
    }
  }

  const endPhoneDemo = async () => {
    if (audioRef.current?.timer) {
      clearInterval(audioRef.current.timer)
    }
    setIsCallActive(false)
    toast.info('Call ended')
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const clearConversation = () => {
    setConversation([])
    setTranscript('')
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
          Try out your AI agent before deploying it live
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
              {FREE_DEMO_MINUTES - demoMinutesUsed} free minutes remaining
            </>
          )}
        </Badge>
        {!hasFullAccess && (
          <Button variant="outline" size="sm" onClick={() => setShowPaywall(true)}>
            <CreditCard className="w-4 h-4 mr-2" />
            Upgrade for Full Demo
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
              <p className="text-sm text-muted-foreground">No agents created yet</p>
            ) : (
              agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedAgent?.id === agent.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-border hover:border-blue-300'
                  }`}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{agent.agentType}</p>
                    </div>
                    <Badge variant="outline">{agent.language || 'en-US'}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Demo Interface */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <Tabs value={demoMode} onValueChange={setDemoMode}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="browser">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Browser Voice Chat
                </TabsTrigger>
                <TabsTrigger value="phone">
                  <Phone className="w-4 h-4 mr-2" />
                  Test Call
                  {!hasFullAccess && <Lock className="w-3 h-3 ml-1" />}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {demoMode === 'browser' ? (
              <div className="space-y-4">
                {/* Conversation Display */}
                <div className="h-64 overflow-y-auto border rounded-lg p-4 bg-gray-50 space-y-3">
                  {conversation.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Mic className="w-8 h-8 mb-2" />
                      <p>Click the microphone to start talking</p>
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
                              : 'bg-white border'
                          }`}
                        >
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

                {/* Live Transcript */}
                {isListening && transcript && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-700">{transcript}</p>
                  </div>
                )}

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    size="lg"
                    variant={isListening ? 'destructive' : 'default'}
                    className="rounded-full w-16 h-16"
                    onClick={isListening ? stopListening : startListening}
                    disabled={isProcessing}
                  >
                    {isListening ? (
                      <MicOff className="w-6 h-6" />
                    ) : (
                      <Mic className="w-6 h-6" />
                    )}
                  </Button>

                  {isSpeaking && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-full w-16 h-16"
                      onClick={stopSpeaking}
                    >
                      <VolumeX className="w-6 h-6" />
                    </Button>
                  )}

                  {conversation.length > 0 && (
                    <Button
                      variant="ghost"
                      onClick={clearConversation}
                    >
                      Clear Chat
                    </Button>
                  )}
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  {isListening ? 'Listening... Speak now' : 'Click microphone to speak'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Phone Number Input */}
                <div className="space-y-2">
                  <Label>Your Phone Number</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="+1 (555) 123-4567"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      disabled={isCallActive}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The AI agent will call this number for a live demo
                  </p>
                </div>

                {/* Call Status */}
                {isCallActive && (
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                        <span className="font-medium text-green-700">Call in progress</span>
                      </div>
                      <span className="font-mono text-green-700">{formatDuration(callDuration)}</span>
                    </div>
                  </div>
                )}

                {/* Call Controls */}
                <div className="flex justify-center">
                  {!isCallActive ? (
                    <Button
                      size="lg"
                      className="rounded-full w-16 h-16 bg-green-500 hover:bg-green-600"
                      onClick={startPhoneDemo}
                      disabled={!selectedAgent}
                    >
                      <Phone className="w-6 h-6" />
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      variant="destructive"
                      className="rounded-full w-16 h-16"
                      onClick={endPhoneDemo}
                    >
                      <PhoneOff className="w-6 h-6" />
                    </Button>
                  )}
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  {hasFullAccess 
                    ? 'Test calls use your Twilio credits'
                    : 'Upgrade to full access to make test calls'}
                </p>
              </div>
            )}
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
              Get unlimited browser voice demos and phone test calls
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium">Free Plan</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {FREE_DEMO_MINUTES} minutes of browser voice chat</li>
                <li>• Basic agent testing</li>
              </ul>
            </div>
            <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-700">Full Access - $29/month</h4>
              <ul className="text-sm text-blue-600 space-y-1">
                <li>• Unlimited browser voice demos</li>
                <li>• Phone test calls (uses your Twilio credits)</li>
                <li>• Full agent flow testing (booking, transfers)</li>
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

// Missing import
function Clock(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
