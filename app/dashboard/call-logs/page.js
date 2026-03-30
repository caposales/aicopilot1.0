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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  PhoneCall, 
  Clock, 
  User, 
  Bot, 
  Search, 
  Download, 
  Play, 
  ExternalLink,
  MessageSquare,
  FileText,
  Sparkles,
  X,
  Pause,
  Volume2
} from 'lucide-react'
import { format } from 'date-fns'

export default function CallLogsPage() {
  const [callLogs, setCallLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCall, setSelectedCall] = useState(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [audioRef, setAudioRef] = useState(null)

  useEffect(() => {
    fetchCallLogs()
  }, [])

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchCallLogs = async () => {
    try {
      const res = await fetch('/api/call-logs', { headers: getAuthHeaders() })
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
      missed: 'bg-yellow-100 text-yellow-700',
      'no-answer': 'bg-orange-100 text-orange-700'
    }
    return (
      <Badge variant="outline" className={statusStyles[status] || 'bg-gray-100'}>
        {status?.replace(/[_-]/g, ' ')}
      </Badge>
    )
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getSentimentBadge = (sentiment) => {
    if (!sentiment) return null
    const styles = {
      positive: 'bg-green-100 text-green-700',
      neutral: 'bg-gray-100 text-gray-700',
      negative: 'bg-red-100 text-red-700'
    }
    const emojis = {
      positive: '😊',
      neutral: '😐',
      negative: '😞'
    }
    return (
      <Badge variant="outline" className={styles[sentiment]}>
        {emojis[sentiment]} {sentiment}
      </Badge>
    )
  }

  const filteredLogs = callLogs.filter(log => 
    log.from?.includes(searchQuery) ||
    log.to?.includes(searchQuery) ||
    log.callSid?.includes(searchQuery) ||
    log.transcript?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalDuration = callLogs.reduce((sum, log) => sum + (log.duration || 0), 0)
  const avgDuration = callLogs.length > 0 ? Math.round(totalDuration / callLogs.length) : 0
  const completedCalls = callLogs.filter(log => log.status === 'completed').length
  const bookingsMade = callLogs.filter(log => log.toolsUsed?.includes('book_appointment')).length

  const playRecording = (url) => {
    if (audioRef) {
      audioRef.pause()
    }
    const audio = new Audio(url)
    setAudioRef(audio)
    audio.play()
    setIsPlayingAudio(true)
    audio.onended = () => setIsPlayingAudio(false)
  }

  const pauseRecording = () => {
    if (audioRef) {
      audioRef.pause()
      setIsPlayingAudio(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Call Logs</h1>
          <p className="text-muted-foreground mt-1">
            View call history, transcripts, and recordings
          </p>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
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
                <p className="text-2xl font-bold">{formatDuration(avgDuration)}</p>
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
                <p className="text-2xl font-bold">{bookingsMade}</p>
                <p className="text-sm text-muted-foreground">Bookings Made</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-orange-100">
                <MessageSquare className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{callLogs.filter(l => l.transcript).length}</p>
                <p className="text-sm text-muted-foreground">With Transcripts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by phone number, call SID, or transcript content..."
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
                When your agent receives calls, they'll appear here with full transcripts
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
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Tools Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCall(log)}>
                    <TableCell>
                      {log.createdAt ? format(new Date(log.createdAt), 'MMM d, yyyy HH:mm') : '-'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.from || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{log.to || '-'}</TableCell>
                    <TableCell>{formatDuration(log.duration)}</TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell>{getSentimentBadge(log.sentiment)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {log.toolsUsed?.map((tool, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {tool.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                        {(!log.toolsUsed || log.toolsUsed.length === 0) && '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {log.transcript && (
                          <Button variant="ghost" size="sm" title="View Transcript">
                            <FileText className="w-4 h-4" />
                          </Button>
                        )}
                        {log.recordingUrl && (
                          <Button variant="ghost" size="sm" title="Play Recording">
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Call Detail Dialog */}
      <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="w-5 h-5" />
              Call Details
            </DialogTitle>
            <DialogDescription>
              {selectedCall?.createdAt && format(new Date(selectedCall.createdAt), 'MMMM d, yyyy HH:mm:ss')}
            </DialogDescription>
          </DialogHeader>

          {selectedCall && (
            <Tabs defaultValue="transcript" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="transcript">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="summary">
                  <Sparkles className="w-4 h-4 mr-2" />
                  AI Summary
                </TabsTrigger>
                <TabsTrigger value="details">
                  <FileText className="w-4 h-4 mr-2" />
                  Details
                </TabsTrigger>
              </TabsList>

              <TabsContent value="transcript" className="mt-4">
                <ScrollArea className="h-[400px] border rounded-lg p-4">
                  {selectedCall.transcript ? (
                    <div className="space-y-4">
                      {selectedCall.transcript.split('\n').map((line, i) => {
                        const isAgent = line.toLowerCase().startsWith('agent:') || line.toLowerCase().startsWith('ai:')
                        const isUser = line.toLowerCase().startsWith('user:') || line.toLowerCase().startsWith('caller:')
                        return (
                          <div
                            key={i}
                            className={`flex ${isAgent ? 'justify-start' : isUser ? 'justify-end' : 'justify-center'}`}
                          >
                            <div
                              className={`max-w-[80%] p-3 rounded-lg ${
                                isAgent
                                  ? 'bg-blue-50 border border-blue-100'
                                  : isUser
                                  ? 'bg-gray-100'
                                  : 'bg-yellow-50 text-yellow-800 text-sm'
                              }`}
                            >
                              {line}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mb-4" />
                      <p>No transcript available for this call</p>
                    </div>
                  )}
                </ScrollArea>

                {/* Recording Player */}
                {selectedCall.recordingUrl && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant={isPlayingAudio ? 'destructive' : 'default'}
                        onClick={() => isPlayingAudio ? pauseRecording() : playRecording(selectedCall.recordingUrl)}
                      >
                        {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">Call Recording</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatDuration(selectedCall.duration)}</span>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="summary" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    {selectedCall.summary ? (
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">Call Summary</h4>
                          <p className="text-sm text-muted-foreground">{selectedCall.summary}</p>
                        </div>
                        {selectedCall.keyPoints && (
                          <div>
                            <h4 className="font-medium mb-2">Key Points</h4>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {selectedCall.keyPoints.map((point, i) => (
                                <li key={i}>{point}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selectedCall.actionItems && selectedCall.actionItems.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2">Action Items</h4>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {selectedCall.actionItems.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Sparkles className="w-12 h-12 mb-4" />
                        <p>AI summary not available</p>
                        <p className="text-sm">Summaries are generated for completed calls with transcripts</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="details" className="mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Call SID</p>
                      <p className="font-mono text-sm">{selectedCall.callSid || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">From</p>
                      <p className="font-mono">{selectedCall.from || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">To</p>
                      <p className="font-mono">{selectedCall.to || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Agent</p>
                      <p>{selectedCall.agentName || '-'}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Duration</p>
                      <p>{formatDuration(selectedCall.duration)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      {getStatusBadge(selectedCall.status)}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Sentiment</p>
                      {getSentimentBadge(selectedCall.sentiment) || <span>-</span>}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tools Used</p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {selectedCall.toolsUsed?.map((tool, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {tool.replace(/_/g, ' ')}
                          </Badge>
                        )) || '-'}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
