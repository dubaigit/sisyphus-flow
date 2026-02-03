/// <reference types="bun-types" />
import { describe, it, expect } from "bun:test"

import { resolveExecutorBackend, type RoutingDecision } from "./routing"
import type { RoutingPolicy } from "../../claude-flow/types"

const DEFAULT_POLICY: RoutingPolicy = {
  enabled: true,
  swarmCategories: ["ultrabrain"],
  localCategories: ["quick"],
  defaultExecutor: "local",
  autoSwarmFileThreshold: 3,
}

describe("resolveExecutorBackend", () => {
  describe("when routing is disabled", () => {
    it("always returns local regardless of category", () => {
      //#given
      const policy: RoutingPolicy = { ...DEFAULT_POLICY, enabled: false }

      //#when
      const result = resolveExecutorBackend({ category: "ultrabrain", policy, runtimeAvailable: true })

      //#then
      expect(result.executor).toBe("local")
      expect(result.reason).toContain("disabled")
    })
  })

  describe("when runtime is unavailable", () => {
    it("falls back to local even for swarm categories", () => {
      //#given
      const policy = { ...DEFAULT_POLICY }

      //#when
      const result = resolveExecutorBackend({ category: "ultrabrain", policy, runtimeAvailable: false })

      //#then
      expect(result.executor).toBe("local")
      expect(result.reason).toContain("unavailable")
    })
  })

  describe("when routing is enabled and runtime is available", () => {
    it("routes swarmCategories to swarm", () => {
      //#given
      const policy = { ...DEFAULT_POLICY }

      //#when
      const result = resolveExecutorBackend({ category: "ultrabrain", policy, runtimeAvailable: true })

      //#then
      expect(result.executor).toBe("swarm")
      expect(result.reason).toContain("swarmCategories")
    })

    it("routes localCategories to local", () => {
      //#given
      const policy = { ...DEFAULT_POLICY }

      //#when
      const result = resolveExecutorBackend({ category: "quick", policy, runtimeAvailable: true })

      //#then
      expect(result.executor).toBe("local")
      expect(result.reason).toContain("localCategories")
    })

    it("uses defaultExecutor for unmapped categories", () => {
      //#given
      const policy = { ...DEFAULT_POLICY, defaultExecutor: "local" as const }

      //#when
      const result = resolveExecutorBackend({ category: "visual-engineering", policy, runtimeAvailable: true })

      //#then
      expect(result.executor).toBe("local")
      expect(result.reason).toContain("default")
    })

    it("routes unmapped categories to swarm when defaultExecutor is swarm", () => {
      //#given
      const policy = { ...DEFAULT_POLICY, defaultExecutor: "swarm" as const }

      //#when
      const result = resolveExecutorBackend({ category: "visual-engineering", policy, runtimeAvailable: true })

      //#then
      expect(result.executor).toBe("swarm")
      expect(result.reason).toContain("default")
    })

    it("handles multiple swarm categories", () => {
      //#given
      const policy = { ...DEFAULT_POLICY, swarmCategories: ["ultrabrain", "unspecified-high", "refactoring"] }

      //#when
      const r1 = resolveExecutorBackend({ category: "ultrabrain", policy, runtimeAvailable: true })
      const r2 = resolveExecutorBackend({ category: "unspecified-high", policy, runtimeAvailable: true })
      const r3 = resolveExecutorBackend({ category: "refactoring", policy, runtimeAvailable: true })

      //#then
      expect(r1.executor).toBe("swarm")
      expect(r2.executor).toBe("swarm")
      expect(r3.executor).toBe("swarm")
    })

    it("handles multiple local categories", () => {
      //#given
      const policy = { ...DEFAULT_POLICY, localCategories: ["quick", "documentation"] }

      //#when
      const r1 = resolveExecutorBackend({ category: "quick", policy, runtimeAvailable: true })
      const r2 = resolveExecutorBackend({ category: "documentation", policy, runtimeAvailable: true })

      //#then
      expect(r1.executor).toBe("local")
      expect(r2.executor).toBe("local")
    })
  })

  describe("when no category is provided (subagent_type path)", () => {
    it("always returns local for subagent_type calls", () => {
      //#given
      const policy = { ...DEFAULT_POLICY, defaultExecutor: "swarm" as const }

      //#when
      const result = resolveExecutorBackend({ category: undefined, policy, runtimeAvailable: true })

      //#then
      expect(result.executor).toBe("local")
      expect(result.reason).toContain("no category")
    })
  })

  describe("localCategories takes precedence over swarmCategories", () => {
    it("routes to local when category is in both lists", () => {
      //#given — category in both lists (misconfiguration)
      const policy = { ...DEFAULT_POLICY, swarmCategories: ["ultrabrain"], localCategories: ["ultrabrain"] }

      //#when
      const result = resolveExecutorBackend({ category: "ultrabrain", policy, runtimeAvailable: true })

      //#then — local wins (safety-first)
      expect(result.executor).toBe("local")
      expect(result.reason).toContain("localCategories")
    })
  })
})
