/**
 * Consensus Gate — Layer 4
 *
 * For categories listed in consensus.requiredCategories, runs a HiveMind
 * consensus vote BEFORE task execution. The consensus decision is injected
 * into the agent's prompt so the swarm agrees on the approach.
 *
 * Non-blocking: if consensus fails or times out, execution proceeds normally.
 */

import { log } from "../../shared/logger"
import { getClaudeFlowRuntime } from "../../claude-flow"
import type { ClaudeFlowConsensusConfig } from "../../claude-flow/types"

const TAG = "[consensus-gate]"

export interface ConsensusGateInput {
  category: string
  description: string
  prompt: string
  consensusConfig: ClaudeFlowConsensusConfig
}

export interface ConsensusGateResult {
  /** Whether consensus was required and obtained */
  consensusObtained: boolean
  /** The consensus decision (empty string if not obtained) */
  decision: string
  /** Confidence level 0-1 */
  confidence: number
  /** Reason for the outcome */
  reason: string
}

export interface ConsensusGateDeps {
  getRuntimeFn?: typeof getClaudeFlowRuntime
}

/**
 * Check if consensus is required for this category and obtain it.
 *
 * Returns a ConsensusGateResult that the caller can use to augment
 * the agent prompt with the swarm's agreed-upon approach.
 */
export async function runConsensusGate(
  input: ConsensusGateInput,
  deps?: ConsensusGateDeps,
): Promise<ConsensusGateResult> {
  const { category, consensusConfig } = input
  const getRuntimeFn = deps?.getRuntimeFn ?? getClaudeFlowRuntime

  // 1. Check if consensus is enabled
  if (!consensusConfig.enabled) {
    return { consensusObtained: false, decision: "", confidence: 0, reason: "consensus disabled" }
  }

  // 2. Check if this category requires consensus
  if (!consensusConfig.requiredCategories.includes(category)) {
    return { consensusObtained: false, decision: "", confidence: 0, reason: `category "${category}" not in requiredCategories` }
  }

  // 3. Check runtime availability
  const runtime = getRuntimeFn()
  if (!runtime?.isRunning()) {
    log(`${TAG} runtime unavailable — skipping consensus`)
    return { consensusObtained: false, decision: "", confidence: 0, reason: "runtime unavailable" }
  }

  // 4. Run consensus
  try {
    const question = `Task: ${input.description}\n\nPrompt: ${input.prompt.slice(0, 500)}\n\nWhat is the best approach for this task? Consider architecture, patterns, and potential pitfalls.`

    log(`${TAG} requesting consensus for category="${category}"`)
    const result = await runtime.hiveMindConsensus({
      question,
      algorithm: consensusConfig.defaultAlgorithm,
      topology: "hierarchical",
    })

    if (!result.success) {
      log(`${TAG} consensus failed: ${result.error}`)
      return { consensusObtained: false, decision: "", confidence: 0, reason: `consensus failed: ${result.error ?? "unknown"}` }
    }

    log(`${TAG} consensus obtained`, { decision: result.decision.slice(0, 100), confidence: result.confidence })
    return {
      consensusObtained: true,
      decision: result.decision,
      confidence: result.confidence,
      reason: `${consensusConfig.defaultAlgorithm} consensus reached (confidence: ${result.confidence})`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`${TAG} consensus error: ${msg}`)
    return { consensusObtained: false, decision: "", confidence: 0, reason: `consensus error: ${msg}` }
  }
}

/**
 * Augment a prompt with consensus decision if one was obtained.
 */
export function augmentPromptWithConsensus(prompt: string, gate: ConsensusGateResult): string {
  if (!gate.consensusObtained || !gate.decision) {
    return prompt
  }

  return `${prompt}\n\n---\n[SWARM CONSENSUS] (confidence: ${gate.confidence.toFixed(2)}, algorithm: ${gate.reason})\n${gate.decision}\n---\nConsider the swarm's consensus above when executing this task.`
}
