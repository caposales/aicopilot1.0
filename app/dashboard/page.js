'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, Bot, PhoneCall, AlertCircle } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const ws = localStorage.getItem('workspace')
    if (ws) setWorkspace(JSON.parse(ws))
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/dashboard/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const statCards = [
    {
      title: 'Total Agents',
      value: stats?.totalAgents || 0,
      description: 'Active voice agents',
      icon: Bot,
      color: 'text-blue-600',
      bg: 'bg-blue-100'
    },
    {
      title: 'Phone Numbers',
      value: stats?.totalPhoneNumbers || 0,
      description: 'Purchased numbers',
      icon: Phone,
      color: 'text-green-600',
      bg: 'bg-green-100'
    },
    {
      title: 'Total Calls',
      value: stats?.totalCalls || 0,
      description: 'All time calls',
      icon: PhoneCall,
      color: 'text-purple-600',
      bg: 'bg-purple-100'
    },
    {
      title: 'Error Rate',
      value: '0%',
      description: 'Last 24 hours',
      icon: AlertCircle,
      color: 'text-orange-600',
      bg: 'bg-orange-100'
    }
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome to {workspace?.name || 'your workspace'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? '-' : stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Set up your voice AI agent in a few steps</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                  1
                </span>
                <span>Configure your integrations (Twilio, Deepgram, ElevenLabs)</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                  2
                </span>
                <span>Buy a phone number or bring your own</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                  3
                </span>
                <span>Create and configure your inbound agent</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                  4
                </span>
                <span>Test your agent and go live!</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest calls and events</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.recentCalls?.length > 0 ? (
              <div className="space-y-3">
                {stats.recentCalls.map((call) => (
                  <div key={call.id} className="flex items-center gap-3 text-sm">
                    <PhoneCall className="w-4 h-4 text-muted-foreground" />
                    <span>{call.from} → {call.to}</span>
                    <span className="text-muted-foreground ml-auto">
                      {new Date(call.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No calls yet. Set up your first agent to get started!
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
