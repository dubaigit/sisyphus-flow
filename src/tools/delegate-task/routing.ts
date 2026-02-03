/**
 * Routing Decision — resolves whether a delegate_task call should use
 * the local executor (OpenCode sessions) or the swarm executor (claude-flow).
 *
 * Safety-first: localCategories takes precedence over swarmCategories.
 * No category (subagent_type path) always routes local.
 */

import type { RoutingPolicy } from "../../claude-flow/types"

export type ExecutorBackend = "local" | "swarm"

export interface RoutingDecision {
  executor: ExecutorBackend
  reason: string
}

export interface RoutingInput {
  category: string | undefined
  policy: RoutingPolicy
  runtimeAvailable: boolean
}

/**
 * Determine which executor backend to use for a delegate_task call.
 *
 * Decision order:
 * 1. Routing disabled → local
 * 2. No category (subagent_type path) → local
 * 3. Runtime unavailable → local (fallback)
 * 4. Category in localCategories → local (safety-first precedence)
 * 5. Category in swarmCategories → swarm
 * 6. defaultExecutor
 */
export function resolveExecutorBackend(input: RoutingInput): RoutingDecision {
  const { category, policy, runtimeAvailable } = input

  // 1. Routing disabled
  if (!policy.enabled) {
    return { executor: "local", reason: "routing disabled" }
  }

  // 2. No category (subagent_type path — always local)
  if (!category) {
    return { executor: "local", reason: "no category — subagent_type always routes local" }
  }

  // 3. Runtime unavailable — fallback to local
  if (!runtimeAvailable) {
    return { executor: "local", reason: "claude-flow runtime unavailable — fallback to local" }
  }

  // 4. localCategories takes precedence (safety-first)
  if (policy.localCategories.includes(category)) {
    return { executor: "local", reason: `category "${category}" in localCategories` }
  }

  // 5. swarmCategories
  if (policy.swarmCategories.includes(category)) {
    return { executor: "swarm", reason: `category "${category}" in swarmCategories` }
  }

  // 6. defaultExecutor
  return { executor: policy.defaultExecutor, reason: `category "${category}" not mapped — using default "${policy.defaultExecutor}"` }
}
