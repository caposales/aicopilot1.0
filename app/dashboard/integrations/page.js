'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Phone,
  Building2,
  Calendar,
  Mic,
  Volume2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  ExternalLink
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

const INTEGRATIONS = [
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Voice calls and phone numbers',
    icon: Phone,
    color: 'text-red-600',
    bg: 'bg-red-100',
    fields: [
      { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { key: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'Your Twilio Auth Token' }
    ],
    docsUrl: 'https://www.twilio.com/docs'
  },
  {
    id: 'ghl',
    name: 'GoHighLevel',
    description: 'CRM and contact management',
    icon: Building2,
    color: 'text-green-600',
    bg: 'bg-green-100',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Your GHL API Key' },
      { key: 'locationId', label: 'Location ID', type: 'text', placeholder: 'Location ID (optional)' }
    ],
    docsUrl: 'https://highlevel.stoplight.io/docs/integrations'
  },
  {
    id: 'calcom',
    name: 'Cal.com',
    description: 'Calendar scheduling',
    icon: Calendar,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'cal_xxxxxxxxxxxxxxxx' }
    ],
    docsUrl: 'https://cal.com/docs/api'
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    description: 'Speech-to-text (STT)',
    icon: Mic,
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Your Deepgram API Key' }
    ],
    docsUrl: 'https://developers.deepgram.com/docs'
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Text-to-speech (TTS)',
    icon: Volume2,
    color: 'text-orange-600',
    bg: 'bg-orange-100',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Your ElevenLabs API Key' }
    ],
    docsUrl: 'https://docs.elevenlabs.io'
  }
]

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [formData, setFormData] = useState({})
  const [showSecrets, setShowSecrets] = useState({})
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/integrations', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setIntegrations(data)
    } catch (error) {
      console.error('Failed to fetch integrations:', error)
      toast.error('Failed to load integrations')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (integrationId) => {
    setSavingId(integrationId)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/integrations/${integrationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData[integrationId] || {})
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save integration')
      }

      toast.success(`${integrationId.charAt(0).toUpperCase() + integrationId.slice(1)} connected successfully!`)
      setFormData({ ...formData, [integrationId]: {} })
      fetchIntegrations()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSavingId(null)
    }
  }

  const handleRemove = async (integrationId) => {
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/api/integrations/${integrationId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      toast.success('Integration removed')
      fetchIntegrations()
    } catch (error) {
      toast.error('Failed to remove integration')
    }
  }

  const updateFormField = (integrationId, field, value) => {
    setFormData({
      ...formData,
      [integrationId]: {
        ...formData[integrationId],
        [field]: value
      }
    })
  }

  const toggleSecret = (integrationId, field) => {
    setShowSecrets({
      ...showSecrets,
      [`${integrationId}-${field}`]: !showSecrets[`${integrationId}-${field}`]
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect your services to power your AI voice agent
        </p>
      </div>

      <div className="grid gap-6">
        {INTEGRATIONS.map((integration) => {
          const status = integrations[integration.id]
          const isConfigured = status?.configured
          const Icon = integration.icon

          return (
            <Card key={integration.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${integration.bg}`}>
                      <Icon className={`w-6 h-6 ${integration.color}`} />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {integration.name}
                        {isConfigured ? (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="w-3 h-3 mr-1" />
                            Not Connected
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{integration.description}</CardDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Docs
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {integration.fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label>{field.label}</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showSecrets[`${integration.id}-${field.key}`] ? 'text' : field.type}
                            placeholder={isConfigured ? (status[field.key] || '••••••••****') : field.placeholder}
                            value={formData[integration.id]?.[field.key] || ''}
                            onChange={(e) => updateFormField(integration.id, field.key, e.target.value)}
                          />
                          {field.type === 'password' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => toggleSecret(integration.id, field.key)}
                            >
                              {showSecrets[`${integration.id}-${field.key}`] ? (
                                <EyeOff className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <Eye className="w-4 h-4 text-muted-foreground" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-4">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSave(integration.id)}
                        disabled={savingId === integration.id}
                      >
                        {savingId === integration.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : isConfigured ? (
                          'Update'
                        ) : (
                          'Connect'
                        )}
                      </Button>
                    </div>

                    {isConfigured && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Integration</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove the {integration.name} integration?
                              This will delete your stored credentials.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => handleRemove(integration.id)}
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
