'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Search, Building2, Bot, Users as UsersIcon, Phone, Settings, ChevronRight, X } from 'lucide-react'

export default function AdminClientsPage() {
  const [clients, setClients] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [clientDetails, setClientDetails] = useState(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/admin/clients', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setClients(data.clients || [])
    } catch (error) {
      toast.error('Failed to fetch clients')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchClientDetails = async (workspaceId) => {
    setDetailsLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/admin/clients/${workspaceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setClientDetails(data)
    } catch (error) {
      toast.error('Failed to fetch client details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleViewClient = (client) => {
    setSelectedClient(client)
    setShowDetailsDialog(true)
    fetchClientDetails(client.id)
  }

  const filteredClients = clients.filter(client => {
    const query = searchQuery.toLowerCase()
    return (
      client.name?.toLowerCase().includes(query) ||
      client.owner?.email?.toLowerCase().includes(query) ||
      client.owner?.name?.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6" data-testid="admin-clients-page">
      <div>
        <h1 className="text-3xl font-bold">Client Management</h1>
        <p className="text-muted-foreground mt-1">
          View all clients and their configurations
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Clients</CardTitle>
              <CardDescription>{clients.length} total workspaces</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="client-search-input"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No clients found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Agents</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>Integrations</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} data-testid={`client-row-${client.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-blue-700" />
                        </div>
                        <span className="font-medium">{client.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{client.owner?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{client.owner?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{client.stats?.agents || 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{client.stats?.contacts || 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {client.stats?.hasIntegrations?.twilio && (
                          <Badge variant="secondary" className="text-xs">Twilio</Badge>
                        )}
                        {client.stats?.hasIntegrations?.ghl && (
                          <Badge variant="secondary" className="text-xs">GHL</Badge>
                        )}
                        {client.stats?.hasIntegrations?.calcom && (
                          <Badge variant="secondary" className="text-xs">Cal</Badge>
                        )}
                        {!client.stats?.hasIntegrations?.twilio && 
                         !client.stats?.hasIntegrations?.ghl && 
                         !client.stats?.hasIntegrations?.calcom && (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(client.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewClient(client)}
                        data-testid={`view-client-${client.id}`}
                      >
                        View Details
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Client Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {selectedClient?.name}
            </DialogTitle>
          </DialogHeader>
          
          {detailsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : clientDetails ? (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="agents">Agents ({clientDetails.agents?.length || 0})</TabsTrigger>
                <TabsTrigger value="contacts">Contacts ({clientDetails.contacts?.length || 0})</TabsTrigger>
                <TabsTrigger value="integrations">Integrations</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Owner Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {clientDetails.owner ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Name</p>
                          <p className="font-medium">{clientDetails.owner.name}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Email</p>
                          <p>{clientDetails.owner.email}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Created</p>
                          <p>{new Date(clientDetails.owner.createdAt).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Auth Provider</p>
                          <p>{clientDetails.owner.authProvider || 'email'}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No owner found</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Calls</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {clientDetails.recentCalls?.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>From</TableHead>
                            <TableHead>To</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientDetails.recentCalls.slice(0, 5).map((call) => (
                            <TableRow key={call.id}>
                              <TableCell>{call.from || '-'}</TableCell>
                              <TableCell>{call.to || '-'}</TableCell>
                              <TableCell>{call.duration || 0}s</TableCell>
                              <TableCell>{new Date(call.createdAt).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-muted-foreground">No calls yet</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="agents" className="space-y-4">
                {clientDetails.agents?.length > 0 ? (
                  <div className="space-y-4">
                    {clientDetails.agents.map((agent) => (
                      <Card key={agent.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Bot className="w-5 h-5 text-blue-600" />
                              <CardTitle className="text-lg">{agent.name}</CardTitle>
                            </div>
                            <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                              {agent.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Type</p>
                              <p className="font-medium">{agent.agentType}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Voice</p>
                              <p>{agent.voiceId}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Language</p>
                              <p>{agent.language}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Call Transfer</p>
                              <Badge variant={agent.callTransferEnabled ? 'default' : 'outline'}>
                                {agent.callTransferEnabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Calendar Booking</p>
                              <Badge variant={agent.calendarBookingEnabled ? 'default' : 'outline'}>
                                {agent.calendarBookingEnabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Phone Number</p>
                              <p>{agent.phoneNumber || 'Not assigned'}</p>
                            </div>
                          </div>
                          {agent.customPrompt && (
                            <div className="mt-4">
                              <p className="text-muted-foreground text-sm">Custom Prompt</p>
                              <p className="text-sm bg-muted p-2 rounded mt-1 max-h-20 overflow-auto">
                                {agent.customPrompt}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No agents configured
                  </div>
                )}
              </TabsContent>

              <TabsContent value="contacts" className="space-y-4">
                {clientDetails.contacts?.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Company</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientDetails.contacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">
                            {contact.firstName} {contact.lastName}
                          </TableCell>
                          <TableCell>{contact.email || '-'}</TableCell>
                          <TableCell>{contact.phone || '-'}</TableCell>
                          <TableCell>{contact.company || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No contacts imported
                  </div>
                )}
              </TabsContent>

              <TabsContent value="integrations" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Integration Status</CardTitle>
                    <CardDescription>Client-provided integrations (Twilio, GHL, Cal.com)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Phone className="w-5 h-5" />
                          <span>Twilio</span>
                        </div>
                        <Badge variant={clientDetails.integrations?.twilio?.configured ? 'default' : 'secondary'}>
                          {clientDetails.integrations?.twilio?.configured ? 'Configured' : 'Not Set'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Settings className="w-5 h-5" />
                          <span>GoHighLevel</span>
                        </div>
                        <Badge variant={clientDetails.integrations?.ghl?.configured ? 'default' : 'secondary'}>
                          {clientDetails.integrations?.ghl?.configured ? 'Configured' : 'Not Set'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <UsersIcon className="w-5 h-5" />
                          <span>Cal.com</span>
                        </div>
                        <Badge variant={clientDetails.integrations?.calcom?.configured ? 'default' : 'secondary'}>
                          {clientDetails.integrations?.calcom?.configured ? 'Configured' : 'Not Set'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load client details
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
