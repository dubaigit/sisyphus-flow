import {
  lsp_goto_definition,
  lsp_find_references,
  lsp_symbols,
  lsp_diagnostics,
  lsp_prepare_rename,
  lsp_rename,
  lspManager,
} from "./lsp"

export { lspManager }

import {
  ast_grep_search,
  ast_grep_replace,
} from "./ast-grep"

import { grep } from "./grep"
import { glob } from "./glob"

// Claude-Flow tools
import {
  cf_swarm_init,
  cf_swarm_status,
  cf_swarm_stop,
  cf_agent_spawn,
} from "./claude-flow-swarm"

import {
  cf_memory_store,
  cf_memory_search,
  cf_memory_retrieve,
} from "./claude-flow-memory"

import { cf_hive_mind_consensus } from "./claude-flow-hivemind"

import { cf_security_scan } from "./claude-flow-security"
export { createSlashcommandTool, discoverCommandsSync } from "./slashcommand"

import {
  session_list,
  session_read,
  session_search,
  session_info,
} from "./session-manager"

export { sessionExists } from "./session-manager/storage"

export { interactive_bash, startBackgroundCheck as startTmuxCheck } from "./interactive-bash"
export { createSkillTool } from "./skill"
export { createSkillMcpTool } from "./skill-mcp"

import {
  createBackgroundOutput,
  createBackgroundCancel,
  type BackgroundOutputManager,
  type BackgroundCancelClient,
} from "./background-task"

import type { PluginInput, ToolDefinition } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../features/background-agent"

type OpencodeClient = PluginInput["client"]

export { createCallOmoAgent } from "./call-omo-agent"
export { createLookAt } from "./look-at"
export { createDelegateTask } from "./delegate-task"
export {
  createTaskCreateTool,
  createTaskGetTool,
  createTaskList,
  createTaskUpdateTool,
} from "./task"

export function createBackgroundTools(manager: BackgroundManager, client: OpencodeClient): Record<string, ToolDefinition> {
  const outputManager: BackgroundOutputManager = manager
  const cancelClient: BackgroundCancelClient = client
  return {
    background_output: createBackgroundOutput(outputManager, client),
    background_cancel: createBackgroundCancel(manager, cancelClient),
  }
}

export const builtinTools: Record<string, ToolDefinition> = {
  lsp_goto_definition,
  lsp_find_references,
  lsp_symbols,
  lsp_diagnostics,
  lsp_prepare_rename,
  lsp_rename,
  ast_grep_search,
  ast_grep_replace,
  grep,
  glob,
  session_list,
  session_read,
  session_search,
  session_info,
}

/** Claude-Flow tools — registered conditionally when claude_flow.enabled */
export const claudeFlowTools: Record<string, ToolDefinition> = {
  cf_swarm_init,
  cf_swarm_status,
  cf_swarm_stop,
  cf_agent_spawn,
  cf_memory_store,
  cf_memory_search,
  cf_memory_retrieve,
  cf_hive_mind_consensus,
  cf_security_scan,
}
