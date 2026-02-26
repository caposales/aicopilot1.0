'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Search, Clock, Filter, RefreshCw } from 'lucide-react'

const ACTION_COLORS = {
  user_login: 'bg-green-100 text-green-700',
  user_logout: 'bg-gray-100 text-gray-700',
  user_register: 'bg-blue-100 text-blue-700',
  admin_invite_sent: 'bg-purple-100 text-purple-700',
  admin_role_changed: 'bg-amber-100 text-amber-700',
  user_deleted: 'bg-red-100 text-red-700',
  agent_created: 'bg-cyan-100 text-cyan-700',
  agent_updated: 'bg-cyan-100 text-cyan-700',
  agent_deleted: 'bg-orange-100 text-orange-700',
  contacts_imported: 'bg-indigo-100 text-indigo-700',
  contact_created: 'bg-indigo-100 text-indigo-700',
  contact_deleted: 'bg-pink-100 text-pink-700'
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [limit, setLimit] = useState('100')

  useEffect(() => {
    fetchLogs()
  }, [actionFilter, limit])

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const params = new URLSearchParams({ limit })
      if (actionFilter !== 'all') {
        params.append('action', actionFilter)
      }
      
      const res = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setLogs(data.auditLogs || [])
    } catch (error) {
      toast.error('Failed to fetch audit logs')
    } finally {
      setIsLoading(false)
    }
  }

  const formatAction = (action) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatDetails = (details) => {
    if (!details || Object.keys(details).length === 0) return '-'
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ')
  }

  const filteredLogs = logs.filter(log => {
    const query = searchQuery.toLowerCase()
    return (
      log.userEmail?.toLowerCase().includes(query) ||
      log.action?.toLowerCase().includes(query) ||
      formatDetails(log.details).toLowerCase().includes(query)
    )
  })

  const uniqueActions = [...new Set(logs.map(l => l.action))]

  return (
    <div className="space-y-6" data-testid="admin-audit-logs-page">
      <div>
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">
          Track all system activities and changes
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Activity Log
              </CardTitle>
              <CardDescription>{logs.length} events</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="audit-search-input"
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-40">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {uniqueActions.map(action => (
                    <SelectItem key={action} value={action}>
                      {formatAction(action)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="250">250</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchLogs}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No audit logs found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`audit-row-${log.id}`}>
                    <TableCell className="whitespace-nowrap">
                      <div>
                        <p className="font-medium">{new Date(log.createdAt).toLocaleDateString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}>
                        {formatAction(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{log.userEmail || 'System'}</p>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm text-muted-foreground truncate">
                        {formatDetails(log.details)}
                      </p>
                    </TableCell>
                    <TableCell>
                      {log.targetType && (
                        <Badge variant="outline" className="text-xs">
                          {log.targetType}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
