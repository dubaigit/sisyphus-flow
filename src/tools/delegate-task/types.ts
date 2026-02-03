import type { PluginInput } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent"
import type { CategoriesConfig, GitMasterConfig, BrowserAutomationProvider } from "../../config/schema"

export type OpencodeClient = PluginInput["client"]

export interface DelegateTaskArgs {
  description: string
  prompt: string
  category?: string
  subagent_type?: string
  run_in_background: boolean
  session_id?: string
  command?: string
  load_skills: string[]
  execute?: {
    task_id: string
    task_dir?: string
  }
}

export interface ToolContextWithMetadata {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void
}

export interface SyncSessionCreatedEvent {
  sessionID: string
  parentID: string
  title: string
}

export interface DelegateTaskToolOptions {
  manager: BackgroundManager
  client: OpencodeClient
  directory: string
  userCategories?: CategoriesConfig
  gitMasterConfig?: GitMasterConfig
  sisyphusJuniorModel?: string
  browserProvider?: BrowserAutomationProvider
  onSyncSessionCreated?: (event: SyncSessionCreatedEvent) => Promise<void>
  /** Claude-flow routing policy — when enabled, routes certain categories to swarm executor */
  routingPolicy?: import("../../claude-flow/types").RoutingPolicy
  /** Claude-flow consensus config — when enabled, gates certain categories with HiveMind consensus */
  consensusConfig?: import("../../claude-flow/types").ClaudeFlowConsensusConfig
  /** Claude-flow memory config — when enabled, searches memory before and stores learnings after task execution */
  memoryConfig?: import("../../claude-flow/types").ClaudeFlowMemoryConfig
}

export interface BuildSystemContentInput {
  skillContent?: string
  categoryPromptAppend?: string
  agentName?: string
}
