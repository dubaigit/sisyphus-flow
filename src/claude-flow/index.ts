/**
 * Claude-Flow Integration Module
 *
 * Barrel export for the claude-flow runtime adapter.
 * This is the ONLY entry point other modules should use
 * to interact with claude-flow.
 */

export {
  ClaudeFlowRuntime,
  createClaudeFlowRuntime,
  getClaudeFlowRuntime,
  destroyClaudeFlowRuntime,
  _resetRuntimeForTest,
  CF_UNAVAILABLE_PREFIX,
  CF_NOT_INSTALLED,
} from "./runtime"
export type { RuntimeDeps } from "./runtime"
export type * from "./types"
export { DEFAULT_CLAUDE_FLOW_CONFIG } from "./types"
