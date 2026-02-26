'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Phone, Bot, PhoneCall, AlertCircle, Building2 } from 'lucide-react'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch admin stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers || 0,
      description: 'Registered users',
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-100'
    },
    {
      title: 'Total Workspaces',
      value: stats?.totalWorkspaces || 0,
      description: 'Active workspaces',
      icon: Building2,
      color: 'text-green-600',
      bg: 'bg-green-100'
    },
    {
      title: 'Total Agents',
      value: stats?.totalAgents || 0,
      description: 'All agents',
      icon: Bot,
      color: 'text-purple-600',
      bg: 'bg-purple-100'
    },
    {
      title: 'Total Calls',
      value: stats?.totalCalls || 0,
      description: 'All time calls',
      icon: PhoneCall,
      color: 'text-orange-600',
      bg: 'bg-orange-100'
    },
    {
      title: 'Phone Numbers',
      value: stats?.totalPhoneNumbers || 0,
      description: 'All purchased numbers',
      icon: Phone,
      color: 'text-cyan-600',
      bg: 'bg-cyan-100'
    },
    {
      title: 'Total Errors',
      value: stats?.totalErrors || 0,
      description: 'All error logs',
      icon: AlertCircle,
      color: 'text-red-600',
      bg: 'bg-red-100'
    }
  ]

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div>
        <h1 className="text-3xl font-bold text-red-700">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Platform overview and management
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title} data-testid={`stat-card-${stat.title.toLowerCase().replace(/\s/g, '-')}`}>
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

      {/* Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Users</CardTitle>
            <CardDescription>Latest registered users</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.recentUsers?.length > 0 ? (
              <div className="space-y-3">
                {stats.recentUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-xs font-medium text-blue-700">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No users yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Calls</CardTitle>
            <CardDescription>Latest call activity</CardDescription>
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
                No calls yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
