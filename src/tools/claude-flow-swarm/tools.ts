/**
 * Claude-Flow Swarm Tools
 *
 * First-class plugin tools for claude-flow swarm orchestration.
 * These call the ClaudeFlowRuntime adapter (not CLI directly).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { getClaudeFlowRuntime, CF_UNAVAILABLE_PREFIX } from "../../claude-flow"

const CF_UNAVAILABLE = `${CF_UNAVAILABLE_PREFIX} Claude-Flow runtime not available. Enable it in sisyphus-flow.json: { "claude_flow": { "enabled": true } }`

function requireRuntime() {
  const runtime = getClaudeFlowRuntime()
  if (!runtime || !runtime.isRunning()) {
    return null
  }
  return runtime
}

export const cf_swarm_init: ToolDefinition = tool({
  description:
    "Initialize a claude-flow multi-agent swarm. Sets up the swarm topology, strategy, and consensus algorithm. " +
    "Use hierarchical topology (anti-drift default) with specialized strategy for most tasks. " +
    "Keep maxAgents at 6-8 for tight coordination.",
  args: {
    topology: tool.schema
      .enum(["hierarchical", "hierarchical-mesh", "mesh", "star", "adaptive"])
      .default("hierarchical")
      .describe("Swarm topology. 'hierarchical' is the anti-drift default."),
    max_agents: tool.schema
      .number()
      .default(8)
      .describe("Maximum concurrent agents (6-8 recommended for anti-drift)"),
    strategy: tool.schema
      .enum(["specialized", "balanced", "aggressive"])
      .default("specialized")
      .describe("Load balancing strategy. 'specialized' prevents role overlap."),
    consensus: tool.schema
      .enum(["raft", "byzantine", "gossip", "crdt", "quorum"])
      .default("raft")
      .describe("Consensus algorithm. 'raft' is anti-drift default."),
  },
  execute: async (args) => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const result = await runtime.swarmInit({
      topology: args.topology,
      maxAgents: args.max_agents,
      strategy: args.strategy,
      consensus: args.consensus,
    })

    if (!result.success) {
      return `Swarm init failed: ${result.error}`
    }

    return [
      `Swarm initialized successfully.`,
      `  Topology: ${result.topology}`,
      `  Max Agents: ${result.maxAgents}`,
      `  Strategy: ${result.strategy}`,
      result.swarmId ? `  Swarm ID: ${result.swarmId}` : "",
    ].filter(Boolean).join("\n")
  },
})

export const cf_swarm_status: ToolDefinition = tool({
  description: "Get the current status of the claude-flow swarm, including active agents and topology.",
  args: {},
  execute: async () => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const result = await runtime.swarmStatus()
    if (!result.running) {
      return result.error ? `Swarm not running: ${result.error}` : "No swarm currently running."
    }

    const lines = [
      `Swarm Status: RUNNING`,
      result.topology ? `  Topology: ${result.topology}` : "",
      result.agentCount !== undefined ? `  Agents: ${result.agentCount}` : "",
    ]

    if (result.agents?.length) {
      lines.push("  Active Agents:")
      for (const agent of result.agents) {
        lines.push(`    - ${agent.name} (${agent.type}): ${agent.status}`)
      }
    }

    return lines.filter(Boolean).join("\n")
  },
})

export const cf_swarm_stop: ToolDefinition = tool({
  description: "Stop the current claude-flow swarm and all its agents.",
  args: {},
  execute: async () => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const success = await runtime.swarmStop()
    return success ? "Swarm stopped successfully." : "Failed to stop swarm."
  },
})

export const cf_agent_spawn: ToolDefinition = tool({
  description:
    "Spawn a claude-flow agent within the current swarm. " +
    "Supports 60+ agent types including coder, tester, reviewer, architect, security-auditor, queen, coordinator, and more.",
  args: {
    type: tool.schema
      .string()
      .describe("Agent type (e.g., 'coder', 'tester', 'reviewer', 'architect', 'security-auditor')"),
    name: tool.schema
      .string()
      .optional()
      .describe("Agent name (auto-generated if not provided)"),
    model: tool.schema
      .string()
      .optional()
      .describe("Model override for this agent"),
    task: tool.schema
      .string()
      .optional()
      .describe("Initial task to assign to the agent"),
    timeout: tool.schema
      .number()
      .optional()
      .describe("Timeout in seconds (default: 300)"),
  },
  execute: async (args) => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const result = await runtime.agentSpawn({
      type: args.type,
      name: args.name,
      model: args.model,
      task: args.task,
      timeout: args.timeout,
    })

    if (!result.success) {
      return `Agent spawn failed: ${result.error}`
    }

    return [
      `Agent spawned successfully.`,
      `  Name: ${result.name}`,
      `  Type: ${result.type}`,
      result.agentId ? `  ID: ${result.agentId}` : "",
    ].filter(Boolean).join("\n")
  },
})
