'use client'

import AgentEditor from '@/components/AgentEditor'

export default function OutboundAgentPage() {
  return (
    <AgentEditor 
      agentType="outbound"
      title="Outbound Agents"
      description="Create and manage AI agents for making outbound calls"
    />
  )
}
