'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Phone,
  PhoneIncoming,
  Bot,
  FileText,
  AlertTriangle,
  Plug,
  ChevronDown,
  ChevronRight,
  LogOut,
  Settings,
  Menu,
  X,
  Shield
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Buy Phone Number', href: '/dashboard/buy-number', icon: Phone },
  { name: 'Purchased Numbers', href: '/dashboard/numbers', icon: PhoneIncoming },
  {
    name: 'Agents',
    icon: Bot,
    children: [
      { name: 'Inbound Agent', href: '/dashboard/agents/inbound' },
      { name: 'Outbound Agent', href: '/dashboard/agents/outbound' },
    ]
  },
  { name: 'Call Logs', href: '/dashboard/call-logs', icon: FileText },
  { name: 'Error Logs', href: '/dashboard/error-logs', icon: AlertTriangle },
  { name: 'Integrations', href: '/dashboard/integrations', icon: Plug },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [agentsOpen, setAgentsOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('user')
      return stored ? JSON.parse(stored) : null
    }
    return null
  })

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
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">ENT Solutions</h1>
            <p className="text-xs text-muted-foreground">Voice Agent Platform</p>
          </div>
        </div>
      </div>
      
      <Separator />
      
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            if (item.children) {
              return (
                <Collapsible
                  key={item.name}
                  open={agentsOpen}
                  onOpenChange={setAgentsOpen}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between font-normal"
                    >
                      <span className="flex items-center gap-3">
                        <item.icon className="w-5 h-5" />
                        {item.name}
                      </span>
                      {agentsOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-8 space-y-1 mt-1">
                    {item.children.map((child) => (
                      <Link key={child.href} href={child.href} onClick={() => setMobileOpen(false)}>
                        <Button
                          variant={pathname === child.href ? 'secondary' : 'ghost'}
                          className={cn(
                            'w-full justify-start font-normal',
                            pathname === child.href && 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          )}
                        >
                          {child.name}
                        </Button>
                      </Link>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )
            }
            
            return (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-3 font-normal',
                    pathname === item.href && 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Button>
              </Link>
            )
          })}
        </nav>
      </ScrollArea>
      
      <div className="p-4 border-t">
        {user && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-sm font-medium text-blue-700">
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
