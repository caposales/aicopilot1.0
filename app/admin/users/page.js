'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Search, Trash2, Eye, Shield, User, UserPlus, Crown, ShieldCheck } from 'lucide-react'

export default function AdminUsersPage() {
  const [users, setUsers] = useState([])
  const [roleInfo, setRoleInfo] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'moderator' })
  const [newRole, setNewRole] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const headers = { 'Authorization': `Bearer ${token}` }
      
      const [usersRes, roleRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/role', { headers })
      ])
      
      const [usersData, roleData] = await Promise.all([
        usersRes.json(),
        roleRes.json()
      ])
      
      setUsers(usersData.users || [])
      setRoleInfo(roleData)
    } catch (error) {
      toast.error('Failed to fetch users')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return
    
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete user')
      }
      
      toast.success('User deleted successfully')
      setUsers(users.filter(u => u.id !== selectedUser.id))
      setShowDeleteDialog(false)
      setSelectedUser(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleInvite = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(inviteForm)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invite')
      }
      
      toast.success(data.existed ? 'User role updated' : 'Invite sent (check console)')
      setShowInviteDialog(false)
      setInviteForm({ email: '', name: '', role: 'moderator' })
      fetchData()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleRoleChange = async () => {
    if (!selectedUser) return
    
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/admin/users/${selectedUser.id}/role`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ adminRole: newRole === 'user' ? null : newRole })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to change role')
      }
      
      toast.success('Role updated successfully')
      setShowRoleDialog(false)
      fetchData()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const getRoleBadge = (user) => {
    if (user.isSuperAdmin) {
      return (
        <Badge variant="destructive" className="gap-1">
          <Crown className="w-3 h-3" /> Super Admin
        </Badge>
      )
    }
    if (user.adminRole === 'moderator') {
      return (
        <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-700">
          <ShieldCheck className="w-3 h-3" /> Moderator
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="gap-1">
        <User className="w-3 h-3" /> {user.role || 'User'}
      </Badge>
    )
  }

  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase()
    return (
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query)
    )
  })

  const canManageRoles = roleInfo?.permissions?.canAssignRoles
  const canDeleteUsers = roleInfo?.permissions?.canDeleteUsers
  const canInvite = roleInfo?.permissions?.canInviteAdmins

  return (
    <div className="space-y-6" data-testid="admin-users-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">
            View and manage all users on the platform
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setShowInviteDialog(true)} data-testid="invite-admin-btn">
            <UserPlus className="w-4 h-4 mr-2" />
            Invite Admin
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Users</CardTitle>
              <CardDescription>{users.length} total users</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="user-search-input"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No users found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-xs font-medium text-blue-700">
                            {user.name?.charAt(0).toUpperCase() || 'U'}
                          </span>
                        </div>
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {user.authProvider || 'email'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setSelectedUser(user); setShowDetailsDialog(true); }}
                          data-testid={`view-user-${user.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canManageRoles && !user.isSuperAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { 
                              setSelectedUser(user); 
                              setNewRole(user.adminRole || 'user'); 
                              setShowRoleDialog(true); 
                            }}
                            data-testid={`role-user-${user.id}`}
                          >
                            <Shield className="w-4 h-4" />
                          </Button>
                        )}
                        {canDeleteUsers && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => { setSelectedUser(user); setShowDeleteDialog(true); }}
                            disabled={user.isSuperAdmin}
                            data-testid={`delete-user-${user.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedUser?.name}? This will also delete their workspace and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} data-testid="confirm-delete-btn">
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-blue-700">
                    {selectedUser.name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{selectedUser.name}</h3>
                  <p className="text-muted-foreground">{selectedUser.email}</p>
                  {getRoleBadge(selectedUser)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">User ID</p>
                  <p className="font-mono text-xs">{selectedUser.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Workspace ID</p>
                  <p className="font-mono text-xs">{selectedUser.workspaceId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Auth Provider</p>
                  <p>{selectedUser.authProvider || 'email'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{new Date(selectedUser.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Admin Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Admin</DialogTitle>
            <DialogDescription>
              Send an invite to grant admin access. If user exists, their role will be updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input
                placeholder="John Doe"
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moderator">Moderator (view only)</SelectItem>
                  <SelectItem value="super_admin">Super Admin (full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} data-testid="send-invite-btn">
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the admin role for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Regular User</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange} data-testid="change-role-btn">
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
