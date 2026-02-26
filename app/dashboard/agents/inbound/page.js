'use client'

import AgentEditor from '@/components/AgentEditor'

export default function InboundAgentPage() {
  return (
    <AgentEditor 
      agentType="inbound"
      title="Inbound Agents"
      description="Create and manage AI agents for handling inbound calls"
    />
  )
}
