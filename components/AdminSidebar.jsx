'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  Shield,
  LogOut,
  Menu,
  X,
  ArrowLeft,
  Building2,
  Clock,
  Crown
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Clients', href: '/admin/clients', icon: Building2 },
  { name: 'Content', href: '/admin/content', icon: FolderOpen },
  { name: 'Audit Logs', href: '/admin/audit-logs', icon: Clock },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [roleInfo, setRoleInfo] = useState(null)
  const [user, setUser] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('user')
      return stored ? JSON.parse(stored) : null
    }
    return null
  })

  useEffect(() => {
    fetchRoleInfo()
  }, [])

  const fetchRoleInfo = async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) return
    
    try {
      const res = await fetch('/api/admin/role', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setRoleInfo(data)
      }
    } catch {}
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
    localStorage.removeItem('workspace')
    router.push('/')
  }

  const NavContent = () => (
    <>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">ENT Solutions</p>
          </div>
        </div>
        {roleInfo && (
          <div className="mt-3">
            <Badge variant={roleInfo.isSuperAdmin ? 'destructive' : 'secondary'} className="w-full justify-center">
              {roleInfo.isSuperAdmin ? (
                <><Crown className="w-3 h-3 mr-1" /> Super Admin</>
              ) : (
                <><Shield className="w-3 h-3 mr-1" /> Moderator</>
              )}
            </Badge>
          </div>
        )}
      </div>
      
      <Separator />
      
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <Button
                variant={pathname === item.href ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-3 font-normal',
                  pathname === item.href && 'bg-red-50 text-red-700 hover:bg-red-100'
                )}
                data-testid={`admin-nav-${item.name.toLowerCase().replace(/\s/g, '-')}`}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Button>
            </Link>
          ))}
        </nav>
        
        <Separator className="my-4" />
        
        <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 font-normal text-muted-foreground"
            data-testid="back-to-dashboard-btn"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Button>
        </Link>
      </ScrollArea>
      
      <div className="p-4 border-t">
        {user && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-sm font-medium text-red-700">
                {user.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleLogout}
          data-testid="admin-logout-btn"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card flex flex-col transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <NavContent />
      </aside>
    </>
  )
}
