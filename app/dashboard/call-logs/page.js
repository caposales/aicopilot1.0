'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PhoneCall, Clock, User, Bot, Search, Download, Play, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'

export default function CallLogsPage() {
  const [callLogs, setCallLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchCallLogs()
  }, [])

  const fetchCallLogs = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/call-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setCallLogs(data.callLogs || [])
    } catch (error) {
      console.error('Failed to fetch call logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status) => {
    const statusStyles = {
      completed: 'bg-green-100 text-green-700',
      in_progress: 'bg-blue-100 text-blue-700',
      failed: 'bg-red-100 text-red-700',
      missed: 'bg-yellow-100 text-yellow-700'
    }
    return (
      <Badge variant="outline" className={statusStyles[status] || 'bg-gray-100'}>
        {status?.replace('_', ' ')}
      </Badge>
    )
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const filteredLogs = callLogs.filter(log => 
    log.from?.includes(searchQuery) ||
    log.to?.includes(searchQuery) ||
    log.callSid?.includes(searchQuery)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Call Logs</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your call history
          </p>
        </div>
        <Button variant="outline" disabled>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-blue-100">
                <PhoneCall className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{callLogs.length}</p>
                <p className="text-sm text-muted-foreground">Total Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-green-100">
                <Clock className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">0m</p>
                <p className="text-sm text-muted-foreground">Avg Duration</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-purple-100">
                <Bot className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-muted-foreground">Bookings Made</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-orange-100">
                <User className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-muted-foreground">Transfers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by phone number or call SID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <PhoneCall className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No calls yet</h3>
              <p className="text-sm text-muted-foreground">
                When your agent receives calls, they'll appear here
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tools Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {log.createdAt ? format(new Date(log.createdAt), 'MMM d, yyyy HH:mm') : '-'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.from || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{log.to || '-'}</TableCell>
                    <TableCell>{formatDuration(log.duration)}</TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {log.toolsUsed?.map((tool, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {tool}
                          </Badge>
                        ))}
                        {(!log.toolsUsed || log.toolsUsed.length === 0) && '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {log.recordingUrl && (
                          <Button variant="ghost" size="sm">
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="w-4 h-4" />
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
    </div>
  )
}
