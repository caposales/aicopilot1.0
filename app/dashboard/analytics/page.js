'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  Users,
  Bot,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('7d')

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchAnalytics = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/analytics?range=${timeRange}`, { headers: getAuthHeaders() })
      const data = await res.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '0m'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins === 0) return `${secs}s`
    return `${mins}m ${secs}s`
  }

  const formatPercent = (value) => {
    if (!value && value !== 0) return '-'
    return `${(value * 100).toFixed(1)}%`
  }

  const getChangeIndicator = (change) => {
    if (!change) return null
    const isPositive = change > 0
    return (
      <span className={`flex items-center text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        {Math.abs(change).toFixed(1)}%
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const stats = analytics || {
    totalCalls: 0,
    completedCalls: 0,
    failedCalls: 0,
    avgDuration: 0,
    totalDuration: 0,
    bookingsMade: 0,
    transfersMade: 0,
    successRate: 0,
    peakHour: null,
    topAgent: null,
    callsByDay: [],
    callsByHour: [],
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track your AI agent performance and call metrics
          </p>
        </div>
        <div className="flex gap-2">
          {['24h', '7d', '30d', '90d'].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange(range)}
            >
              {range === '24h' ? 'Today' : range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </Button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Calls</p>
                <p className="text-3xl font-bold">{stats.totalCalls}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100">
                <Phone className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            {getChangeIndicator(stats.callsChange)}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-3xl font-bold">{formatPercent(stats.successRate)}</p>
              </div>
              <div className="p-3 rounded-full bg-green-100">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            {getChangeIndicator(stats.successRateChange)}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Duration</p>
                <p className="text-3xl font-bold">{formatDuration(stats.avgDuration)}</p>
              </div>
              <div className="p-3 rounded-full bg-purple-100">
                <Clock className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            {getChangeIndicator(stats.durationChange)}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Bookings Made</p>
                <p className="text-3xl font-bold">{stats.bookingsMade}</p>
              </div>
              <div className="p-3 rounded-full bg-orange-100">
                <Calendar className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            {getChangeIndicator(stats.bookingsChange)}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calls by Day Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Calls Over Time</CardTitle>
            <CardDescription>Daily call volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between gap-2">
              {(stats.callsByDay?.length > 0 ? stats.callsByDay : Array(7).fill({ count: 0, date: '' })).map((day, i) => {
                const maxCount = Math.max(...(stats.callsByDay?.map(d => d.count) || [1]), 1)
                const height = day.count ? (day.count / maxCount) * 100 : 5
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full bg-blue-100 rounded-t relative" style={{ height: `${height}%`, minHeight: '8px' }}>
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium">
                        {day.count || 0}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {day.date ? format(new Date(day.date), 'EEE') : format(subDays(new Date(), 6 - i), 'EEE')}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Call Outcomes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Call Outcomes</CardTitle>
            <CardDescription>Breakdown by result</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.completedCalls}</span>
                  <span className="text-sm text-muted-foreground">
                    ({formatPercent(stats.totalCalls ? stats.completedCalls / stats.totalCalls : 0)})
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full" 
                  style={{ width: `${stats.totalCalls ? (stats.completedCalls / stats.totalCalls) * 100 : 0}%` }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Failed/Missed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.failedCalls}</span>
                  <span className="text-sm text-muted-foreground">
                    ({formatPercent(stats.totalCalls ? stats.failedCalls / stats.totalCalls : 0)})
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div 
                  className="bg-red-500 h-2 rounded-full" 
                  style={{ width: `${stats.totalCalls ? (stats.failedCalls / stats.totalCalls) * 100 : 0}%` }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span>Transfers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.transfersMade}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Peak Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Peak Hours</CardTitle>
            <CardDescription>Busiest times for calls</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.callsByHour?.length > 0 ? (
              <div className="space-y-2">
                {stats.callsByHour.slice(0, 5).map((hour, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm">{hour.hour}:00 - {hour.hour + 1}:00</span>
                    <Badge variant="secondary">{hour.count} calls</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No call data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Top Performing Agents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Agents</CardTitle>
            <CardDescription>By call volume</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topAgents?.length > 0 ? (
              <div className="space-y-3">
                {stats.topAgents.slice(0, 5).map((agent, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-medium">{agent.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{agent.calls} calls</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No agent data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Sentiment Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Call Sentiment</CardTitle>
            <CardDescription>Customer satisfaction indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">😊 Positive</span>
                <span className="font-medium">{stats.sentimentBreakdown?.positive || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">😐 Neutral</span>
                <span className="font-medium">{stats.sentimentBreakdown?.neutral || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">😞 Negative</span>
                <span className="font-medium">{stats.sentimentBreakdown?.negative || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
