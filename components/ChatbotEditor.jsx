'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Save,
  Plus,
  Trash2,
  ArrowLeft,
  MessageSquare,
  Code,
  Copy,
  Check,
  Sparkles,
  FileText,
  ExternalLink,
  Settings2,
  Palette
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

const DEFAULT_CHATBOT_DATA = {
  name: 'New Chatbot',
  welcomeMessage: 'Hi! How can I help you today?',
  systemPrompt: 'You are a helpful assistant. Be friendly and concise.',
  primaryColor: '#3b82f6',
  position: 'bottom-right',
  bubbleIcon: 'chat',
  headerTitle: 'Chat with us',
  placeholderText: 'Type a message...',
  knowledgeBase: '',
  isActive: true
}

export default function ChatbotEditor({ title, description }) {
  const [chatbots, setChatbots] = useState([])
  const [selectedChatbot, setSelectedChatbot] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [view, setView] = useState('list')
  const [formData, setFormData] = useState({ ...DEFAULT_CHATBOT_DATA })
  const [copied, setCopied] = useState(null)

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  useEffect(() => {
    fetchChatbots()
  }, [])

  const fetchChatbots = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/chatbots', { headers: getAuthHeaders() })
      const data = await res.json()
      setChatbots(data.chatbots || [])
    } catch (error) {
      console.error('Failed to fetch chatbots:', error)
      toast.error('Failed to load chatbots')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateNew = () => {
    setSelectedChatbot(null)
    setFormData({ ...DEFAULT_CHATBOT_DATA })
    setView('edit')
  }

  const handleEditChatbot = (chatbot) => {
    setSelectedChatbot(chatbot)
    setFormData({
      name: chatbot.name || '',
      welcomeMessage: chatbot.welcomeMessage || DEFAULT_CHATBOT_DATA.welcomeMessage,
      systemPrompt: chatbot.systemPrompt || DEFAULT_CHATBOT_DATA.systemPrompt,
      primaryColor: chatbot.primaryColor || DEFAULT_CHATBOT_DATA.primaryColor,
      position: chatbot.position || DEFAULT_CHATBOT_DATA.position,
      bubbleIcon: chatbot.bubbleIcon || DEFAULT_CHATBOT_DATA.bubbleIcon,
      headerTitle: chatbot.headerTitle || DEFAULT_CHATBOT_DATA.headerTitle,
      placeholderText: chatbot.placeholderText || DEFAULT_CHATBOT_DATA.placeholderText,
      knowledgeBase: chatbot.knowledgeBase || '',
      isActive: chatbot.isActive ?? true
    })
    setView('edit')
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a chatbot name')
      return
    }

    setIsSaving(true)
    try {
      const isEditing = selectedChatbot !== null
      const method = isEditing ? 'PUT' : 'POST'
      const url = isEditing ? `/api/chatbots/${selectedChatbot.id}` : '/api/chatbots'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(formData)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save chatbot')
      }

      toast.success(isEditing ? 'Chatbot updated!' : 'Chatbot created!')
      await fetchChatbots()
      
      if (!isEditing) {
        setSelectedChatbot(data)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedChatbot) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/chatbots/${selectedChatbot.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (!res.ok) {
        throw new Error('Failed to delete chatbot')
      }

      toast.success('Chatbot deleted!')
      await fetchChatbots()
      setView('list')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopied(null), 2000)
  }

  const getScriptEmbed = () => {
    if (!selectedChatbot) return ''
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `<script src="${baseUrl}/api/chatbots/${selectedChatbot.id}/widget.js" async></script>`
  }

  const getIframeEmbed = () => {
    if (!selectedChatbot) return ''
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `<iframe src="${baseUrl}/api/chatbots/${selectedChatbot.id}/embed" style="border:none;position:fixed;bottom:20px;right:20px;width:400px;height:600px;z-index:9999;" allow="clipboard-write"></iframe>`
  }

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
      <div className="space-y-6" data-testid="chatbots-list">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <Button onClick={handleCreateNew} data-testid="create-chatbot-btn">
            <Plus className="h-4 w-4 mr-2" />
            Create Chatbot
          </Button>
        </div>

        {chatbots.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No chatbots yet</h3>
              <p className="text-muted-foreground mb-4">Create your first chatbot widget</p>
              <Button onClick={handleCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create Chatbot
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {chatbots.map((chatbot) => (
              <Card 
                key={chatbot.id} 
                className="cursor-pointer hover:border-blue-500 transition-colors"
                onClick={() => handleEditChatbot(chatbot)}
                data-testid={`chatbot-card-${chatbot.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: chatbot.primaryColor || '#3b82f6' }}
                      >
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{chatbot.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {chatbot.position || 'bottom-right'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={chatbot.isActive ? 'default' : 'secondary'}>
                      {chatbot.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {chatbot.welcomeMessage || 'No welcome message'}
                  </p>
                  {chatbot.knowledgeBase && (
                    <div className="flex items-center gap-1 mt-2">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Has knowledge base</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Edit View
  return (
    <div className="space-y-6" data-testid="chatbot-editor">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setView('list')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {selectedChatbot ? 'Edit Chatbot' : 'Create Chatbot'}
            </h1>
            <p className="text-muted-foreground">
              {selectedChatbot ? `Editing: ${selectedChatbot.name}` : 'Create a new chatbot widget'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedChatbot && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Chatbot</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{selectedChatbot.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600">
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button onClick={handleSave} disabled={isSaving} data-testid="save-chatbot-btn">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : selectedChatbot ? 'Save Changes' : 'Create Chatbot'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList>
          <TabsTrigger value="settings">
            <Settings2 className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="h-4 w-4 mr-2" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <FileText className="h-4 w-4 mr-2" />
            Knowledge Base
          </TabsTrigger>
          {selectedChatbot && (
            <TabsTrigger value="embed">
              <Code className="h-4 w-4 mr-2" />
              Embed Code
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Settings</CardTitle>
              <CardDescription>Configure your chatbot's behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Chatbot Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Support Bot"
                  data-testid="chatbot-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="welcomeMessage">Welcome Message</Label>
                <Textarea
                  id="welcomeMessage"
                  value={formData.welcomeMessage}
                  onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                  placeholder="Hi! How can I help you today?"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="systemPrompt">
                  AI System Prompt
                  <span className="text-muted-foreground text-xs ml-2">
                    (Instructions for the AI)
                  </span>
                </Label>
                <Textarea
                  id="systemPrompt"
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  placeholder="You are a helpful customer support assistant..."
                  rows={4}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Active Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable or disable this chatbot
                  </p>
                </div>
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Widget Appearance</CardTitle>
              <CardDescription>Customize how the chat widget looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      placeholder="#3b82f6"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position">Widget Position</Label>
                  <select
                    id="position"
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="headerTitle">Chat Header Title</Label>
                <Input
                  id="headerTitle"
                  value={formData.headerTitle}
                  onChange={(e) => setFormData({ ...formData, headerTitle: e.target.value })}
                  placeholder="Chat with us"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="placeholderText">Input Placeholder</Label>
                <Input
                  id="placeholderText"
                  value={formData.placeholderText}
                  onChange={(e) => setFormData({ ...formData, placeholderText: e.target.value })}
                  placeholder="Type a message..."
                />
              </div>

              {/* Preview */}
              <Separator className="my-4" />
              <div>
                <Label className="mb-2 block">Preview</Label>
                <div className="relative bg-gray-100 rounded-lg p-4 min-h-[200px]">
                  <div 
                    className={`absolute ${formData.position === 'bottom-left' ? 'left-4' : 'right-4'} bottom-4`}
                  >
                    <div 
                      className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer"
                      style={{ backgroundColor: formData.primaryColor }}
                    >
                      <MessageSquare className="h-6 w-6" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Knowledge Base
              </CardTitle>
              <CardDescription>
                Add custom knowledge for your chatbot to reference. This will be used to provide more accurate and relevant responses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="knowledgeBase">
                  Knowledge Content
                  <span className="text-muted-foreground text-xs ml-2">
                    (FAQ, product info, company details, etc.)
                  </span>
                </Label>
                <Textarea
                  id="knowledgeBase"
                  value={formData.knowledgeBase}
                  onChange={(e) => setFormData({ ...formData, knowledgeBase: e.target.value })}
                  placeholder="Enter your business information, FAQs, product details, etc. The AI will use this to answer questions.

Example:
- Our business hours are 9am-5pm Monday to Friday
- We offer free shipping on orders over $50
- Our return policy allows returns within 30 days
- Contact support at support@example.com"
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {formData.knowledgeBase.length} characters
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {selectedChatbot && (
          <TabsContent value="embed" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Embed Code
                </CardTitle>
                <CardDescription>
                  Add the chatbot to your website using one of these methods
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Script Tag */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Script Tag
                    <Badge variant="secondary">Recommended</Badge>
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Add this script to your website's HTML, preferably before the closing &lt;/body&gt; tag.
                  </p>
                  <div className="relative">
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                      {getScriptEmbed()}
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(getScriptEmbed(), 'script')}
                    >
                      {copied === 'script' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* iFrame */}
                <div className="space-y-2">
                  <Label>iFrame Embed</Label>
                  <p className="text-sm text-muted-foreground">
                    Alternative method using an iframe. Less customizable but works on more platforms.
                  </p>
                  <div className="relative">
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                      {getIframeEmbed()}
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(getIframeEmbed(), 'iframe')}
                    >
                      {copied === 'iframe' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Test Link */}
                <div className="space-y-2">
                  <Label>Test Your Chatbot</Label>
                  <p className="text-sm text-muted-foreground">
                    Open a test page to see your chatbot in action.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => window.open(`/api/chatbots/${selectedChatbot.id}/test`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Test Page
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
