'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Phone, Search, MapPin, DollarSign, AlertCircle } from 'lucide-react'

export default function BuyNumberPage() {
  const [country, setCountry] = useState('US')
  const [areaCode, setAreaCode] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])

  const handleSearch = async () => {
    setIsSearching(true)
    // Simulated search - in production, this would call Twilio's available numbers API
    setTimeout(() => {
      setSearchResults([])
      toast.info('Phone number search requires Twilio integration')
      setIsSearching(false)
    }, 1000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Buy Phone Number</h1>
        <p className="text-muted-foreground mt-1">
          Search and purchase phone numbers for your AI agents
        </p>
      </div>

      {/* Requirements Notice */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-900">Twilio Integration Required</h3>
              <p className="text-sm text-amber-700 mt-1">
                To search and purchase phone numbers, you need to connect your Twilio account.
                Go to <a href="/dashboard/integrations" className="underline font-medium">Integrations</a> to set up Twilio.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Search Available Numbers
          </CardTitle>
          <CardDescription>
            Find phone numbers available in your desired region
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Area Code (Optional)</Label>
              <Input
                placeholder="e.g., 415"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
              />
            </div>
            
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={handleSearch}
                disabled={isSearching}
              >
                {isSearching ? (
                  <>Searching...</>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search Numbers
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Numbers</CardTitle>
            <CardDescription>
              {searchResults.length} numbers found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {searchResults.map((number, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Phone className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-mono font-medium">{number.number}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {number.region}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <DollarSign className="w-4 h-4" />
                        {number.price}/mo
                      </div>
                      <Badge variant="outline">{number.type}</Badge>
                    </div>
                    <Button>Purchase</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {searchResults.length === 0 && !isSearching && (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="flex flex-col items-center text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Phone className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">Search for Numbers</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Select a country and optionally an area code, then click search to find available phone numbers.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
