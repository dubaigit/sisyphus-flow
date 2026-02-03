/**
 * Swarm Executor — executes a delegate_task via claude-flow swarm
 * instead of the default OpenCode local session executor.
 *
 * Architecture:
 *   delegate_task → routing → swarm-executor → ClaudeFlowRuntime
 *                                            ↓ (on failure)
 *                                          fallback → local executor
 *
 * This module ONLY handles the swarm execution path.
 * The caller (tools.ts) is responsible for falling back to
 * executeBackgroundTask/executeSyncTask when fallbackToLocal=true.
 */

import { log } from "../../shared/logger"
import { getClaudeFlowRuntime } from "../../claude-flow"

const TAG = "[swarm-executor]"

/**
 * Maps delegate_task categories to claude-flow agent types.
 * Unmapped categories fall back to "coder".
 */
export const SWARM_CATEGORY_AGENT_MAP: Record<string, string> = {
  "ultrabrain": "architect",
  "visual-engineering": "coder",
  "artistry": "coder",
  "quick": "coder",
  "unspecified-low": "coder",
  "unspecified-high": "coder",
  "writing": "researcher",
  "visual": "coder",
  "business-logic": "coder",
  "testing": "tester",
  "documentation": "researcher",
  "refactoring": "coder",
}

export interface SwarmExecutorInput {
  description: string
  prompt: string
  category: string
  agentToUse: string
  systemContent?: string
  skills?: string[]
}

export interface SwarmExecutorResult {
  /** Whether the swarm execution succeeded */
  success: boolean
  /** Which executor was used */
  executor: "swarm" | "local"
  /** If false, caller should fall back to local executor */
  fallbackToLocal: boolean
  /** Human-readable reason for the decision */
  reason: string
  /** Agent type that was spawned (if any) */
  agentType?: string
  /** Agent ID from claude-flow (if spawned) */
  agentId?: string
  /** Formatted output from the swarm task */
  output?: string
}

export interface SwarmExecutorDeps {
  /** Override getClaudeFlowRuntime for testing */
  getRuntimeFn?: typeof getClaudeFlowRuntime
}

/**
 * Execute a task via claude-flow swarm.
 *
 * Flow:
 * 1. Get runtime — if unavailable, fallback
 * 2. Check swarm status — init if not running
 * 3. Map category → agent type
 * 4. Spawn agent with task
 * 5. Return result
 *
 * On ANY failure, returns { fallbackToLocal: true } so the caller
 * can seamlessly fall back to the local executor.
 */
export async function executeSwarmTask(
  input: SwarmExecutorInput,
  deps?: SwarmExecutorDeps,
): Promise<SwarmExecutorResult> {
  const getRuntimeFn = deps?.getRuntimeFn ?? getClaudeFlowRuntime

  // 1. Get runtime
  const runtime = getRuntimeFn()
  if (!runtime) {
    log(`${TAG} runtime unavailable — fallback to local`)
    return {
      success: false,
      executor: "local",
      fallbackToLocal: true,
      reason: "claude-flow runtime unavailable — fallback to local",
    }
  }

  if (!runtime.isRunning()) {
    log(`${TAG} runtime not running — fallback to local`)
    return {
      success: false,
      executor: "local",
      fallbackToLocal: true,
      reason: "claude-flow runtime not running — fallback to local",
    }
  }

  // 2. Check swarm status — init if needed
  try {
    const status = await runtime.swarmStatus()
    if (!status.running) {
      log(`${TAG} swarm not running, initializing`)
      const initResult = await runtime.swarmInit({
        topology: "hierarchical",
        maxAgents: 8,
        strategy: "specialized",
      })
      if (!initResult.success) {
        log(`${TAG} swarm init failed: ${initResult.error}`)
        return {
          success: false,
          executor: "local",
          fallbackToLocal: true,
          reason: `swarm init failed: ${initResult.error ?? "unknown error"}`,
        }
      }
      log(`${TAG} swarm initialized`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`${TAG} swarm status/init error: ${msg}`)
    return {
      success: false,
      executor: "local",
      fallbackToLocal: true,
      reason: `swarm status check failed: ${msg}`,
    }
  }

  // 3. Map category → agent type
  const agentType = SWARM_CATEGORY_AGENT_MAP[input.category] ?? "coder"
  const agentName = `sf-${input.category}-${Date.now().toString(36)}`

  // 4. Spawn agent with task
  try {
    const spawnResult = await runtime.agentSpawn({
      type: agentType,
      name: agentName,
      task: input.prompt,
    })

    if (!spawnResult.success) {
      log(`${TAG} agent spawn failed: ${spawnResult.error}`)
      return {
        success: false,
        executor: "local",
        fallbackToLocal: true,
        reason: `agent spawn failed: ${spawnResult.error ?? "unknown error"}`,
      }
    }

    log(`${TAG} agent spawned`, { agentType, agentName, agentId: spawnResult.agentId })

    // 5. Return success
    const output = [
      `SWARM TASK DISPATCHED`,
      ``,
      `Agent: ${agentName} (type: ${agentType})`,
      `Category: ${input.category}`,
      `Description: ${input.description}`,
      spawnResult.agentId ? `Agent ID: ${spawnResult.agentId}` : null,
      ``,
      `The task has been dispatched to the claude-flow swarm.`,
      `Use \`cf_swarm_status\` to monitor progress.`,
    ].filter(Boolean).join("\n")

    return {
      success: true,
      executor: "swarm",
      fallbackToLocal: false,
      reason: `routed to swarm agent "${agentName}" (type: ${agentType})`,
      agentType,
      agentId: spawnResult.agentId,
      output,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`${TAG} agent spawn error: ${msg}`)
    return {
      success: false,
      executor: "local",
      fallbackToLocal: true,
      reason: `agent spawn error: ${msg}`,
    }
  }
}
