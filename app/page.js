'use client'
export const dynamic = "force-dynamic";
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Phone, Bot, Zap, Shield, ArrowLeft } from 'lucide-react'

// Google Icon Component
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

export default function AuthPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', companyName: '' })
  const [view, setView] = useState('main') // 'main' or 'forgot'
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)

  useEffect(() => {
    // Check if already logged in
    const token = localStorage.getItem('auth_token')
    if (token) {
      router.push('/dashboard')
      return
    }

    // Check for session_id from Google OAuth
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (typeof window !== 'undefined' && window.location.hash?.includes('session_id=')) {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const sessionId = params.get('session_id')
      if (sessionId) {
        handleGoogleCallback(sessionId)
      }
    }
  }, [router])

  const handleGoogleCallback = async (sessionId) => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/google/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Google authentication failed')
      }

      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('workspace', JSON.stringify(data.workspace))

      toast.success('Welcome!')
      // Clear the hash from URL
      window.history.replaceState(null, '', window.location.pathname)
      router.push('/dashboard')
    } catch (error) {
      toast.error(error.message)
      window.history.replaceState(null, '', window.location.pathname)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/'
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Login failed')
      }
      
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('workspace', JSON.stringify(data.workspace))
      
      toast.success('Welcome back!')
      router.push('/dashboard')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed')
      }
      
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('workspace', JSON.stringify(data.workspace))
      
      toast.success('Account created successfully!')
      router.push('/dashboard')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send reset email')
      }

      setResetSent(true)
      toast.success('Password reset link sent! Check your email.')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Forgot Password View
  if (view === 'forgot') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">ENT Solutions</span>
            </div>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              {resetSent 
                ? 'Check your email for the reset link'
                : 'Enter your email to receive a password reset link'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetSent ? (
              <div className="space-y-4 text-center">
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-700">
                    If an account exists with that email, you'll receive a password reset link shortly.
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  (Demo: Check the server console for the reset link)
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => { setView('main'); setResetSent(false); setForgotEmail(''); }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                <Button 
                  type="button"
                  variant="ghost" 
                  className="w-full"
                  onClick={() => setView('main')}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 text-white">
        <div className="max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
              <Phone className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold">ENT Solutions</h1>
          </div>
          
          <h2 className="text-4xl font-bold leading-tight">
            Build Intelligent Voice Agents for Your Business
          </h2>
          
          <p className="text-lg text-blue-200">
            Deploy AI-powered phone agents that handle customer calls, book appointments, and qualify leads 24/7.
          </p>
          
          <div className="space-y-4 pt-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Natural Conversations</h3>
                <p className="text-sm text-blue-200">Human-like voice interactions powered by advanced AI</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Real-time Processing</h3>
                <p className="text-sm text-blue-200">Lightning-fast speech recognition and response</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Enterprise Security</h3>
                <p className="text-sm text-blue-200">Your API keys encrypted and secure</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">ENT Solutions</span>
            </div>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to your account or create a new one</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Google Sign In Button */}
            <Button 
              variant="outline" 
              className="w-full mb-4"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              <GoogleIcon />
              <span className="ml-2">Continue with Google</span>
            </Button>

            <div className="relative my-4">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                or continue with email
              </span>
            </div>

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Password</Label>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                        onClick={() => setView('forgot')}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Full Name</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="John Doe"
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-company">Company Name</Label>
                    <Input
                      id="register-company"
                      type="text"
                      placeholder="Acme Inc."
                      value={registerForm.companyName}
                      onChange={(e) => setRegisterForm({ ...registerForm, companyName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="you@example.com"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="••••••••"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
