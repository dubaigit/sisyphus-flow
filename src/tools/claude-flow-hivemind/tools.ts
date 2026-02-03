/**
 * Claude-Flow Hive-Mind Tools
 *
 * Multi-agent consensus and collective intelligence operations.
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { getClaudeFlowRuntime, CF_UNAVAILABLE_PREFIX } from "../../claude-flow"

const CF_UNAVAILABLE = `${CF_UNAVAILABLE_PREFIX} Claude-Flow runtime not available. Enable it in sisyphus-flow.json: { "claude_flow": { "enabled": true } }`

function requireRuntime() {
  const runtime = getClaudeFlowRuntime()
  if (!runtime || !runtime.isRunning()) return null
  return runtime
}

export const cf_hive_mind_consensus: ToolDefinition = tool({
  description:
    "Run a hive-mind consensus vote across multiple claude-flow agents. " +
    "Useful for architecture decisions, complex tradeoffs, and resolving disagreements. " +
    "Uses raft consensus by default (leader-based, anti-drift).",
  args: {
    question: tool.schema.string().describe("The question to reach consensus on"),
    algorithm: tool.schema
      .enum(["raft", "byzantine", "gossip", "crdt", "quorum"])
      .default("raft")
      .describe("Consensus algorithm. 'raft' for consistency, 'byzantine' for fault tolerance."),
    topology: tool.schema
      .enum(["hierarchical", "mesh", "star"])
      .default("hierarchical")
      .describe("Hive-mind topology"),
  },
  execute: async (args) => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const result = await runtime.hiveMindConsensus({
      question: args.question,
      algorithm: args.algorithm,
      topology: args.topology,
    })

    if (!result.success) {
      return `Consensus failed: ${result.error}`
    }

    const lines = [
      `Consensus reached (${result.algorithm}, confidence: ${(result.confidence * 100).toFixed(0)}%):`,
      ``,
      result.decision,
    ]

    if (result.votes?.length) {
      lines.push("", "Individual votes:")
      for (const vote of result.votes) {
        lines.push(`  ${vote.agent}: ${vote.vote}`)
        if (vote.rationale) lines.push(`    Rationale: ${vote.rationale}`)
      }
    }

    return lines.join("\n")
  },
})
