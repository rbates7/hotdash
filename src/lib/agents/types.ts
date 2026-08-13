export type PublicUser = {
  name: string
  email?: string
}

export type PublicSession = {
  id: string
  user: PublicUser | null
  hasPersistedKey: boolean
}

export type ModelOption = {
  id: string
  label: string
  description?: string
}

export type RepositoryOption = {
  id: string
  label: string
  url: string
  owner?: string
  name?: string
  defaultBranch?: string
}

export type ArtifactPreview = {
  path: string
  name: string
  size?: number
  contentType?: string
  mediaUrl?: string
  previewKind: "image" | "video" | "file"
}

/** Chlk-managed status for specialist-bot tickets. */
export type ChlkStatus = "to_do" | "in_progress" | "blocked" | "done"

/** Metadata owned by Chlk's ops layer, overlaid on any AgentCard. */
export type ChlkTicketMeta = {
  agentId: string
  /** Which specialist bot / agent owns this card. */
  owner?: string
  chlkStatus: ChlkStatus
  /** Required (meaningful) when chlkStatus === "blocked"; cleared otherwise. */
  blockerReason?: string
  isPriorityOne: boolean
  needsFounderDecision: boolean
  founderDecisionNote?: string
  updatedAt: string
}

export type AgentCard = {
  id: string
  title: string
  status: string
  latestRunId?: string
  durationMs?: number
  repository: string
  repositoryUrl?: string
  branch?: string
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  prUrl?: string
  latestMessage?: string
  artifacts: ArtifactPreview[]
  // Chlk extensions — populated by the /api/agents route when ticket metadata exists
  owner?: string
  chlkStatus?: ChlkStatus
  blockerReason?: string
  isPriorityOne?: boolean
  needsFounderDecision?: boolean
  founderDecisionNote?: string
}

/** Derived from ticket metadata; powering the Founder Strip. */
export type FounderStrip = {
  /** ID of the single manually-labeled #1 priority ticket, or null if unset. */
  priorityOneId: string | null
  /** IDs of tickets flagged as needing a decision from the founder. */
  founderDecisionIds: string[]
}

export type AgentListResponse = {
  agents: AgentCard[]
  nextCursor?: string
  founderStrip?: FounderStrip
}

export type CreateAgentInput = {
  name?: string
  prompt: string
  repositoryId: string
  modelId?: string
  branch?: string
  autoCreatePR?: boolean
}

export type CreateAgentResponse = {
  agent: AgentCard
}
