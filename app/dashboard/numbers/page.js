'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Phone, Settings, Trash2, Bot } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'

export default function PurchasedNumbersPage() {
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchPhoneNumbers()
  }, [])

  const fetchPhoneNumbers = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/phone-numbers', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setPhoneNumbers(data.phoneNumbers || [])
    } catch (error) {
      console.error('Failed to fetch phone numbers:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Purchased Numbers</h1>
        <p className="text-muted-foreground mt-1">
          Manage your phone numbers and their agent assignments
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : phoneNumbers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Phone className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No phone numbers</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Purchase a phone number to get started
              </p>
              <Button asChild>
                <a href="/dashboard/buy-number">Buy Phone Number</a>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Assigned Agent</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phoneNumbers.map((number) => (
                  <TableRow key={number.id}>
                    <TableCell className="font-mono font-medium">{number.number}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{number.type || 'local'}</Badge>
                    </TableCell>
                    <TableCell>{number.region || 'US'}</TableCell>
                    <TableCell>
                      {number.agentId ? (
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-blue-600" />
                          <span>{number.agentName || 'Inbound Agent'}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {number.purchasedAt
                        ? format(new Date(number.purchasedAt), 'MMM d, yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={number.status === 'active' ? 'bg-green-100 text-green-700' : ''}
                      >
                        {number.status || 'active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm">
                          <Settings className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
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
    </div>
  )
}
