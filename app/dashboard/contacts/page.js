'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Search, Plus, Trash2, Upload, FileSpreadsheet, Copy, Users, Download } from 'lucide-react'

export default function ContactsPage() {
  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedContact, setSelectedContact] = useState(null)
  const [newContact, setNewContact] = useState({
    firstName: '', lastName: '', email: '', phone: '', company: '', notes: ''
  })
  const [bulkData, setBulkData] = useState('')
  const [bulkImporting, setBulkImporting] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchContacts()
  }, [])

  const fetchContacts = async (search = '') => {
    setIsLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const params = new URLSearchParams({ limit: '100' })
      if (search) params.append('search', search)
      
      const res = await fetch(`/api/contacts?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setContacts(data.contacts || [])
      setTotal(data.total || 0)
    } catch (error) {
      toast.error('Failed to fetch contacts')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e) => {
    setSearchQuery(e.target.value)
    // Debounced search
    clearTimeout(window.searchTimeout)
    window.searchTimeout = setTimeout(() => fetchContacts(e.target.value), 300)
  }

  const handleAddContact = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newContact)
      })
      
      if (!res.ok) throw new Error('Failed to add contact')
      
      toast.success('Contact added')
      setShowAddDialog(false)
      setNewContact({ firstName: '', lastName: '', email: '', phone: '', company: '', notes: '' })
      fetchContacts()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleDeleteContact = async () => {
    if (!selectedContact) return
    
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!res.ok) throw new Error('Failed to delete contact')
      
      toast.success('Contact deleted')
      setShowDeleteDialog(false)
      setSelectedContact(null)
      fetchContacts()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) return []
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
    const contacts = []
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''))
      const contact = {}
      
      headers.forEach((header, idx) => {
        const value = values[idx] || ''
        // Map common header names
        if (['first_name', 'firstname', 'first'].includes(header)) contact.firstName = value
        else if (['last_name', 'lastname', 'last'].includes(header)) contact.lastName = value
        else if (['email', 'email_address'].includes(header)) contact.email = value
        else if (['phone', 'phone_number', 'phonenumber', 'mobile'].includes(header)) contact.phone = value
        else if (['company', 'company_name', 'organization'].includes(header)) contact.company = value
        else if (['notes', 'note'].includes(header)) contact.notes = value
      })
      
      // Only add if at least one field is filled
      if (contact.firstName || contact.lastName || contact.email || contact.phone) {
        contacts.push(contact)
      }
    }
    
    return contacts
  }

  const handleBulkImport = async () => {
    setBulkImporting(true)
    try {
      const parsedContacts = parseCSV(bulkData)
      
      if (parsedContacts.length === 0) {
        throw new Error('No valid contacts found. Check CSV format.')
      }
      
      if (parsedContacts.length > 1000) {
        throw new Error('Maximum 1000 contacts per import')
      }
      
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contacts: parsedContacts })
      })
      
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error || 'Failed to import contacts')
      
      toast.success(`${data.imported} contacts imported successfully`)
      setShowBulkDialog(false)
      setBulkData('')
      fetchContacts()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBulkImporting(false)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      setBulkData(event.target.result)
    }
    reader.readAsText(file)
  }

  const downloadTemplate = () => {
    const template = `first_name,last_name,email,phone,company,notes
John,Doe,john@example.com,+1234567890,Acme Inc,Important client
Jane,Smith,jane@example.com,+0987654321,Tech Corp,New lead`
    
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts_template.csv'
    a.click()
  }

  return (
    <div className="space-y-6" data-testid="contacts-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            Manage your contacts and leads
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulkDialog(true)} data-testid="bulk-import-btn">
            <Upload className="w-4 h-4 mr-2" />
            Bulk Import
          </Button>
          <Button onClick={() => setShowAddDialog(true)} data-testid="add-contact-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                All Contacts
              </CardTitle>
              <CardDescription>{total} total contacts</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="pl-9"
                value={searchQuery}
                onChange={handleSearch}
                data-testid="contact-search-input"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-1">No contacts yet</h3>
              <p className="text-muted-foreground mb-4">
                Add contacts individually or import in bulk
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setShowBulkDialog(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Bulk Import
                </Button>
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Contact
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      {contact.firstName} {contact.lastName}
                    </TableCell>
                    <TableCell>{contact.email || '-'}</TableCell>
                    <TableCell>{contact.phone || '-'}</TableCell>
                    <TableCell>{contact.company || '-'}</TableCell>
                    <TableCell>{new Date(contact.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                        onClick={() => { setSelectedContact(contact); setShowDeleteDialog(true); }}
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

      {/* Add Contact Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Add a new contact to your list</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={newContact.firstName}
                  onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={newContact.lastName}
                  onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="+1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input
                value={newContact.company}
                onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                placeholder="Acme Inc"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={newContact.notes}
                onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddContact} data-testid="save-contact-btn">Add Contact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Import Contacts</DialogTitle>
            <DialogDescription>
              Import contacts from CSV file or paste data directly
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="paste">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="paste">
                <Copy className="w-4 h-4 mr-2" />
                Paste Data
              </TabsTrigger>
              <TabsTrigger value="upload">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Upload CSV
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="paste" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>CSV Data</Label>
                  <Button variant="link" size="sm" onClick={downloadTemplate}>
                    <Download className="w-3 h-3 mr-1" />
                    Download Template
                  </Button>
                </div>
                <Textarea
                  value={bulkData}
                  onChange={(e) => setBulkData(e.target.value)}
                  placeholder={`first_name,last_name,email,phone,company,notes
John,Doe,john@example.com,+1234567890,Acme Inc,Important client
Jane,Smith,jane@example.com,+0987654321,Tech Corp,New lead`}
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  First row should be headers. Supported: first_name, last_name, email, phone, company, notes
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="upload" className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="mb-4">Upload a CSV file with your contacts</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Choose File
                </Button>
                {bulkData && (
                  <p className="mt-4 text-sm text-green-600">File loaded! Ready to import.</p>
                )}
              </div>
              <Button variant="link" size="sm" onClick={downloadTemplate}>
                <Download className="w-3 h-3 mr-1" />
                Download CSV Template
              </Button>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleBulkImport} 
              disabled={!bulkData || bulkImporting}
              data-testid="import-contacts-btn"
            >
              {bulkImporting ? 'Importing...' : 'Import Contacts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedContact?.firstName} {selectedContact?.lastName}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteContact}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
