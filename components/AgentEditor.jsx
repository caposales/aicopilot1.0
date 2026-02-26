'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { 
  Save, 
  Play, 
  Phone, 
  Calendar, 
  Webhook,
  Sparkles,
  Volume2,
  MessageSquare,
  Settings2,
  Copy,
  Plus,
  Trash2,
  ArrowLeft
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ja-JP', label: 'Japanese' },
]

const DEFAULT_FORM_DATA = {
  name: '',
  initialMessage: 'Hello! Thank you for calling. How can I help you today?',
  voiceId: 'rachel',
  language: 'en-US',
  interruptSensitivity: 'high',
  responseSpeed: 'auto',
  aiCreativity: 0.7,
  // Call Transfer Settings
  callTransferEnabled: false,
  callTransferNumber: '',
  callTransferConditions: 'on_request',
  callTransferMessage: "I'll transfer you to a specialist now.",
  // Calendar Booking Settings
  calendarBookingEnabled: false,
  calendarProvider: 'calcom',
  calendarEventType: '',
  bookingConfirmationMessage: 'Your appointment has been booked!',
  // Webhook Settings
  postCallWebhookEnabled: false,
  postCallWebhookUrl: '',
  promptTemplateId: '',
  customPrompt: ''
}

export default function AgentEditor({ agentType = 'inbound', title, description }) {
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [voices, setVoices] = useState([])
  const [prompts, setPrompts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [view, setView] = useState('list') // 'list' or 'edit'
  const [formData, setFormData] = useState({ ...DEFAULT_FORM_DATA, name: `New ${agentType === 'inbound' ? 'Inbound' : 'Outbound'} Agent` })

  useEffect(() => {
    fetchData()
  }, [agentType])

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const headers = { 'Authorization': `Bearer ${token}` }

      const [voicesRes, promptsRes, agentsRes] = await Promise.all([
        fetch('/api/voices'),
        fetch('/api/prompts'),
        fetch('/api/agents', { headers })
      ])

      const voicesData = await voicesRes.json()
      const promptsData = await promptsRes.json()
      const agentsData = await agentsRes.json()

      setVoices(voicesData.voices || [])
      setPrompts(promptsData.prompts || [])
      
      // Filter agents by type
      const filteredAgents = (agentsData.agents || []).filter(a => a.agentType === agentType)
      setAgents(filteredAgents)
    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateNew = () => {
    setSelectedAgent(null)
    setFormData({ 
      ...DEFAULT_FORM_DATA, 
      name: `New ${agentType === 'inbound' ? 'Inbound' : 'Outbound'} Agent`,
      initialMessage: agentType === 'outbound' 
        ? 'Hi! This is a call from ENT Solutions. Do you have a moment to talk?'
        : 'Hello! Thank you for calling. How can I help you today?'
    })
    setView('edit')
  }

  const handleEditAgent = (agent) => {
    setSelectedAgent(agent)
    setFormData({
      name: agent.name || '',
      initialMessage: agent.initialMessage || '',
      voiceId: agent.voiceId || 'rachel',
      language: agent.language || 'en-US',
      interruptSensitivity: agent.interruptSensitivity || 'high',
      responseSpeed: agent.responseSpeed || 'auto',
      aiCreativity: agent.aiCreativity ?? 0.7,
      callTransferEnabled: agent.callTransferEnabled || false,
      callTransferNumber: agent.callTransferNumber || '',
      calendarBookingEnabled: agent.calendarBookingEnabled || false,
      postCallWebhookEnabled: agent.postCallWebhookEnabled || false,
      postCallWebhookUrl: agent.postCallWebhookUrl || '',
      promptTemplateId: agent.promptTemplateId || '',
      customPrompt: agent.customPrompt || ''
    })
    setView('edit')
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter an agent name')
      return
    }

    setIsSaving(true)
    try {
      const token = localStorage.getItem('auth_token')
      const isEditing = selectedAgent !== null
      const method = isEditing ? 'PUT' : 'POST'
      const url = isEditing ? `/api/agents/${selectedAgent.id}` : '/api/agents'

      const payload = {
        ...formData,
        agentType: agentType
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save agent')
      }

      toast.success(isEditing ? 'Agent updated successfully!' : 'Agent created successfully!')
      await fetchData()
      setView('list')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedAgent) return

    setIsDeleting(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/agents/${selectedAgent.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!res.ok) {
        throw new Error('Failed to delete agent')
      }

      toast.success('Agent deleted successfully!')
      await fetchData()
      setView('list')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePromptSelect = (promptId) => {
    const selectedPrompt = prompts.find(p => p.id === promptId)
    if (selectedPrompt) {
      setFormData({
        ...formData,
        promptTemplateId: promptId,
        customPrompt: selectedPrompt.prompt
      })
    }
  }

  const copyAgentId = () => {
    if (selectedAgent) {
      navigator.clipboard.writeText(selectedAgent.id)
      toast.success('Agent ID copied to clipboard')
    }
  }

  const selectedVoice = voices.find(v => v.id === formData.voiceId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // List View
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground mt-1">{description}</p>
          </div>
          <Button onClick={handleCreateNew}>
            <Plus className="w-4 h-4 mr-2" />
            Create Agent
          </Button>
        </div>

        {agents.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-center">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <MessageSquare className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">No {agentType} agents yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first {agentType} agent to get started
                </p>
                <Button onClick={handleCreateNew}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Agent
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => {
              const voice = voices.find(v => v.id === agent.voiceId)
              return (
                <Card 
                  key={agent.id} 
                  className="cursor-pointer hover:border-blue-300 transition-colors"
                  onClick={() => handleEditAgent(agent)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={voice?.avatar} alt={voice?.name} />
                          <AvatarFallback>{agent.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-base">{agent.name}</CardTitle>
                          <CardDescription className="text-xs">
                            Voice: {voice?.name || 'Unknown'}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                        {agent.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {agent.initialMessage || 'No greeting set'}
                    </p>
                    <div className="flex gap-2 mt-3">
                      {agent.callTransferEnabled && (
                        <Badge variant="outline" className="text-xs">Transfer</Badge>
                      )}
                      {agent.calendarBookingEnabled && (
                        <Badge variant="outline" className="text-xs">Booking</Badge>
                      )}
                      {agent.postCallWebhookEnabled && (
                        <Badge variant="outline" className="text-xs">Webhook</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Edit View
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setView('list')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {selectedAgent ? 'Edit Agent' : 'Create Agent'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {selectedAgent ? `Editing: ${selectedAgent.name}` : `Create a new ${agentType} agent`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {selectedAgent && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{selectedAgent.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : selectedAgent ? 'Save Changes' : 'Create Agent'}
          </Button>
        </div>
      </div>

      {/* Agent ID (only shown when editing) */}
      {selectedAgent && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Agent ID</Label>
                <p className="font-mono text-sm">{selectedAgent.id}</p>
              </div>
              <Button variant="outline" size="sm" onClick={copyAgentId}>
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Basic Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Agent Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Agent"
                />
              </div>

              <div className="space-y-2">
                <Label>Initial Message (Greeting)</Label>
                <Textarea
                  value={formData.initialMessage}
                  onChange={(e) => setFormData({ ...formData, initialMessage: e.target.value })}
                  placeholder="Hello! Thank you for calling..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  {agentType === 'outbound' 
                    ? 'This is what the agent says when making a call'
                    : 'This is what the agent says when answering a call'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Language</Label>
                <Select
                  value={formData.language}
                  onValueChange={(value) => setFormData({ ...formData, language: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Voice Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                Voice Agent
              </CardTitle>
              <CardDescription>
                Select the voice for your AI agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {voices.map((voice) => (
                  <div
                    key={voice.id}
                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-blue-300 ${
                      formData.voiceId === voice.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-border'
                    }`}
                    onClick={() => setFormData({ ...formData, voiceId: voice.id })}
                  >
                    <div className="flex flex-col items-center text-center">
                      <Avatar className="w-12 h-12 mb-2">
                        <AvatarImage src={voice.avatar} alt={voice.name} />
                        <AvatarFallback>{voice.name[0]}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{voice.name}</span>
                      <span className="text-xs text-muted-foreground">{voice.description}</span>
                    </div>
                    {formData.voiceId === voice.id && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="default" className="text-xs px-1.5 py-0.5">
                          Selected
                        </Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {selectedVoice && (
                <div className="mt-4 p-4 bg-muted rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={selectedVoice.avatar} alt={selectedVoice.name} />
                      <AvatarFallback>{selectedVoice.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{selectedVoice.name}</p>
                      <p className="text-sm text-muted-foreground">{selectedVoice.description}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" disabled>
                    <Play className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prompt Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Agent Prompt
              </CardTitle>
              <CardDescription>
                Configure how your agent should behave and respond
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Pre-made Prompts</Label>
                <Select
                  value={formData.promptTemplateId}
                  onValueChange={handlePromptSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {prompts.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Custom Prompt</Label>
                <Textarea
                  value={formData.customPrompt}
                  onChange={(e) => setFormData({ ...formData, customPrompt: e.target.value })}
                  placeholder="You are a helpful AI assistant..."
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  This prompt defines your agent's personality and behavior
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Advanced Settings */}
        <div className="space-y-6">
          {/* Response Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5" />
                Response Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Interrupt Sensitivity</Label>
                <div className="flex gap-2">
                  <Button
                    variant={formData.interruptSensitivity === 'high' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, interruptSensitivity: 'high' })}
                  >
                    High
                  </Button>
                  <Button
                    variant={formData.interruptSensitivity === 'low' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, interruptSensitivity: 'low' })}
                  >
                    Low
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  High: Agent stops speaking immediately when interrupted
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Response Speed</Label>
                <div className="flex gap-2">
                  <Button
                    variant={formData.responseSpeed === 'sensitive' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, responseSpeed: 'sensitive' })}
                  >
                    Sensitive
                  </Button>
                  <Button
                    variant={formData.responseSpeed === 'auto' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, responseSpeed: 'auto' })}
                  >
                    Auto
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sensitive: Faster responses, Auto: Balanced timing
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>AI Creativity</Label>
                  <span className="text-sm font-medium">{formData.aiCreativity.toFixed(1)}</span>
                </div>
                <Slider
                  value={[formData.aiCreativity]}
                  onValueChange={([value]) => setFormData({ ...formData, aiCreativity: value })}
                  min={0}
                  max={1}
                  step={0.1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Lower = More focused, Higher = More creative responses
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Call Transfer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Call Transfer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Call Transfer</Label>
                  <p className="text-xs text-muted-foreground">Allow agent to transfer calls</p>
                </div>
                <Switch
                  checked={formData.callTransferEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, callTransferEnabled: checked })}
                />
              </div>
              
              {formData.callTransferEnabled && (
                <div className="space-y-2">
                  <Label>Transfer Number</Label>
                  <Input
                    type="tel"
                    value={formData.callTransferNumber}
                    onChange={(e) => setFormData({ ...formData, callTransferNumber: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Calendar Booking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Calendar Booking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Booking</Label>
                  <p className="text-xs text-muted-foreground">Integrate with Cal.com</p>
                </div>
                <Switch
                  checked={formData.calendarBookingEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, calendarBookingEnabled: checked })}
                />
              </div>
              {formData.calendarBookingEnabled && (
                <p className="text-xs text-amber-600 mt-3">
                  Requires Cal.com integration in Settings
                </p>
              )}
            </CardContent>
          </Card>

          {/* Post-Call Webhook */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="w-5 h-5" />
                Post-Call Webhook
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Send Post-Call Data</Label>
                  <p className="text-xs text-muted-foreground">Send call info to external URL</p>
                </div>
                <Switch
                  checked={formData.postCallWebhookEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, postCallWebhookEnabled: checked })}
                />
              </div>
              
              {formData.postCallWebhookEnabled && (
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <Input
                    type="url"
                    value={formData.postCallWebhookUrl}
                    onChange={(e) => setFormData({ ...formData, postCallWebhookUrl: e.target.value })}
                    placeholder="https://your-webhook.com/endpoint"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
