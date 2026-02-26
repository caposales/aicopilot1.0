import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'ENT Solutions - Voice AI Agent Platform',
  description: 'Build and deploy AI voice agents for inbound calls',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="antialiased">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
