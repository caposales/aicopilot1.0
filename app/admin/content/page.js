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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Search, Trash2, Eye, Bot, PhoneCall, AlertTriangle } from 'lucide-react'

export default function AdminContentPage() {
  const [agents, setAgents] = useState([])
  const [callLogs, setCallLogs] = useState([])
  const [errorLogs, setErrorLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteType, setDeleteType] = useState('')
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)

  useEffect(() => {
    fetchContent()
  }, [])

  const fetchContent = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const [agentsRes, callsRes, errorsRes] = await Promise.all([
        fetch('/api/admin/agents', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/admin/call-logs', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/admin/error-logs', { headers: { 'Authorization': `Bearer ${token}` } })
      ])
      
      const [agentsData, callsData, errorsData] = await Promise.all([
        agentsRes.json(),
        callsRes.json(),
        errorsRes.json()
      ])
      
      setAgents(agentsData.agents || [])
      setCallLogs(callsData.callLogs || [])
      setErrorLogs(errorsData.errorLogs || [])
    } catch (error) {
      toast.error('Failed to fetch content')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedItem || !deleteType) return
    
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/admin/${deleteType}/${selectedItem.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!res.ok) throw new Error('Failed to delete')
      
      toast.success('Deleted successfully')
      
      if (deleteType === 'agents') {
        setAgents(agents.filter(a => a.id !== selectedItem.id))
      } else if (deleteType === 'call-logs') {
        setCallLogs(callLogs.filter(c => c.id !== selectedItem.id))
      } else if (deleteType === 'error-logs') {
        setErrorLogs(errorLogs.filter(e => e.id !== selectedItem.id))
      }
      
      setShowDeleteDialog(false)
      setSelectedItem(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const filteredAgents = agents.filter(agent => {
    const query = searchQuery.toLowerCase()
    return agent.name?.toLowerCase().includes(query)
  })

  const filteredCallLogs = callLogs.filter(log => {
    const query = searchQuery.toLowerCase()
    return log.from?.toLowerCase().includes(query) || log.to?.toLowerCase().includes(query)
  })

  const filteredErrorLogs = errorLogs.filter(log => {
    const query = searchQuery.toLowerCase()
    return log.message?.toLowerCase().includes(query)
  })

  return (
    <div className="space-y-6" data-testid="admin-content-page">
      <div>
        <h1 className="text-3xl font-bold">Content Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage agents, call logs, and error logs
        </p>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="content-search-input"
        />
      </div>

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents" className="gap-2">
            <Bot className="w-4 h-4" /> Agents ({agents.length})
          </TabsTrigger>
          <TabsTrigger value="calls" className="gap-2">
            <PhoneCall className="w-4 h-4" /> Call Logs ({callLogs.length})
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-2">
            <AlertTriangle className="w-4 h-4" /> Error Logs ({errorLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <CardTitle>All Agents</CardTitle>
              <CardDescription>Voice agents across all workspaces</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No agents found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Voice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAgents.map((agent) => (
                      <TableRow key={agent.id}>
                        <TableCell className="font-medium">{agent.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{agent.agentType}</Badge>
                        </TableCell>
                        <TableCell>{agent.voiceId}</TableCell>
                        <TableCell>
                          <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                            {agent.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(agent.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => { setSelectedItem(agent); setShowDetailsDialog(true); }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600"
                              onClick={() => { setSelectedItem(agent); setDeleteType('agents'); setShowDeleteDialog(true); }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calls">
          <Card>
            <CardHeader>
              <CardTitle>All Call Logs</CardTitle>
              <CardDescription>Call history across all workspaces</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredCallLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No call logs found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCallLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.from || '-'}</TableCell>
                        <TableCell>{log.to || '-'}</TableCell>
                        <TableCell>{log.duration || 0}s</TableCell>
                        <TableCell>
                          <Badge variant={log.status === 'completed' ? 'default' : 'secondary'}>
                            {log.status || 'unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(log.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600"
                            onClick={() => { setSelectedItem(log); setDeleteType('call-logs'); setShowDeleteDialog(true); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card>
            <CardHeader>
              <CardTitle>All Error Logs</CardTitle>
              <CardDescription>Error history across all workspaces</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredErrorLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No error logs found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Message</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredErrorLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="max-w-md truncate">{log.message || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{log.type || 'error'}</Badge>
                        </TableCell>
                        <TableCell>{new Date(log.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600"
                            onClick={() => { setSelectedItem(log); setDeleteType('error-logs'); setShowDeleteDialog(true); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-content-delete-btn">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agent Details</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedItem.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p>{selectedItem.agentType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Voice</p>
                  <p>{selectedItem.voiceId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Language</p>
                  <p>{selectedItem.language}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Initial Message</p>
                  <p className="text-sm">{selectedItem.initialMessage}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Custom Prompt</p>
                  <p className="text-sm max-h-32 overflow-auto">{selectedItem.customPrompt || 'None'}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
