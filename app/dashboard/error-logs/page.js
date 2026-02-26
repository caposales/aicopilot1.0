'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
import { AlertTriangle, Search, RefreshCw, XCircle } from 'lucide-react'
import { format } from 'date-fns'

export default function ErrorLogsPage() {
  const [errorLogs, setErrorLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchErrorLogs()
  }, [])

  const fetchErrorLogs = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/error-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setErrorLogs(data.errorLogs || [])
    } catch (error) {
      console.error('Failed to fetch error logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getSeverityBadge = (severity) => {
    const styles = {
      critical: 'bg-red-100 text-red-700 border-red-200',
      error: 'bg-orange-100 text-orange-700 border-orange-200',
      warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      info: 'bg-blue-100 text-blue-700 border-blue-200'
    }
    return (
      <Badge variant="outline" className={styles[severity] || styles.info}>
        {severity}
      </Badge>
    )
  }

  const filteredLogs = errorLogs.filter(log =>
    log.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.source?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Error Logs</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and debug issues with your voice agents
          </p>
        </div>
        <Button variant="outline" onClick={fetchErrorLogs}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search errors..."
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
              <div className="p-4 rounded-full bg-green-100 mb-4">
                <XCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium">No errors</h3>
              <p className="text-sm text-muted-foreground">
                Everything is running smoothly!
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Call ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {log.createdAt ? format(new Date(log.createdAt), 'MMM d, HH:mm:ss') : '-'}
                    </TableCell>
                    <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                    <TableCell className="font-mono text-sm">{log.source || '-'}</TableCell>
                    <TableCell className="max-w-md truncate">{log.message}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.callId ? log.callId.slice(0, 8) + '...' : '-'}
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
