import { describe, it, expect, afterEach } from "bun:test"
import { ClaudeFlowRuntime, _resetRuntimeForTest, CF_NOT_INSTALLED } from "./index"
import type { ExecFn } from "./types"

/**
 * Creates a fake execFn that simulates a working claude-flow installation.
 * Returns deterministic responses for all known subcommands.
 */
function createFakeClaudeFlow(overrides?: {
  versionResult?: { exitCode: number; stdout: string; stderr: string }
}): ExecFn {
  return async (args: string[]) => {
    const cmd = args[0]

    //#given - simulate --version check
    if (args.includes("--version")) {
      return overrides?.versionResult ?? { exitCode: 0, stdout: "3.1.0-alpha.3", stderr: "" }
    }

    //#given - simulate --help capability probes
    if (args.includes("--help")) {
      return { exitCode: 0, stdout: `${cmd} help output`, stderr: "" }
    }

    //#given - simulate swarm status
    if (cmd === "swarm" && args[1] === "status") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          running: true,
          topology: "hierarchical",
          agentCount: 3,
          agents: [
            { name: "worker-1", type: "coder", status: "idle" },
            { name: "worker-2", type: "tester", status: "busy" },
            { name: "worker-3", type: "reviewer", status: "idle" },
          ],
        }),
        stderr: "",
      }
    }

    //#given - simulate swarm init
    if (cmd === "swarm" && args[1] === "init") {
      return { exitCode: 0, stdout: "Swarm initialized", stderr: "" }
    }

    //#given - simulate swarm stop
    if (cmd === "swarm" && args[1] === "stop") {
      return { exitCode: 0, stdout: "Swarm stopped", stderr: "" }
    }

    //#given - simulate agent spawn
    if (cmd === "agent" && args[1] === "spawn") {
      return { exitCode: 0, stdout: "Agent spawned", stderr: "" }
    }

    //#given - simulate memory store
    if (cmd === "memory" && args[1] === "store") {
      return { exitCode: 0, stdout: "Stored", stderr: "" }
    }

    //#given - simulate memory search
    if (cmd === "memory" && args[1] === "search") {
      return {
        exitCode: 0,
        stdout: JSON.stringify([
          { key: "auth/jwt", value: "Use RS256 algorithm", score: 0.95, namespace: "shared" },
        ]),
        stderr: "",
      }
    }

    //#given - simulate memory retrieve
    if (cmd === "memory" && args[1] === "retrieve") {
      return { exitCode: 0, stdout: "Retrieved value", stderr: "" }
    }

    //#given - simulate security scan
    if (cmd === "security" && args[1] === "scan") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          findings: [{ severity: "medium", type: "hardcoded-secret", description: "API key in env" }],
          summary: { total: 1, critical: 0, high: 0, medium: 1, low: 0 },
        }),
        stderr: "",
      }
    }

    //#given - simulate hive-mind
    if (cmd === "hive-mind") {
      if (args[1] === "spawn") {
        return { exitCode: 0, stdout: "Hive-mind spawned", stderr: "" }
      }
      if (args[1] === "consensus") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "Use adapter pattern",
            confidence: 0.92,
            votes: [{ agent: "architect", vote: "adapter", rationale: "Clean separation" }],
          }),
          stderr: "",
        }
      }
    }

    // Default: unknown command
    return { exitCode: 1, stdout: "", stderr: `Unknown command: ${args.join(" ")}` }
  }
}

describe("ClaudeFlowRuntime integration", () => {
  let runtime: ClaudeFlowRuntime

  afterEach(async () => {
    if (runtime) await runtime.stop()
    _resetRuntimeForTest()
  })

  describe("happy path — full lifecycle", () => {
    it("starts, probes capabilities, executes operations, and stops", async () => {
      //#given
      const execFn = createFakeClaudeFlow()
      runtime = new ClaudeFlowRuntime(
        { enabled: true, runtime: "external", healthCheckIntervalMs: 0 },
        { execFn },
      )

      //#when - start
      const started = await runtime.start()

      //#then - started successfully
      expect(started).toBe(true)
      expect(runtime.isRunning()).toBe(true)
      expect(runtime.getHealth().version).toBe("3.1.0-alpha.3")
      expect(runtime.getHealth().status).toBe("running")

      //#then - capabilities probed
      const caps = runtime.getHealth().capabilities
      expect(caps.swarm).toBe(true)
      expect(caps.memory).toBe(true)
      expect(caps.hiveMind).toBe(true)
      expect(caps.security).toBe(true)

      //#when - swarm operations
      const swarmStatus = await runtime.swarmStatus()
      expect(swarmStatus.running).toBe(true)
      expect(swarmStatus.agentCount).toBe(3)
      expect(swarmStatus.agents?.length).toBe(3)

      const swarmInit = await runtime.swarmInit({ topology: "hierarchical" })
      expect(swarmInit.success).toBe(true)
      expect(swarmInit.topology).toBe("hierarchical")

      //#when - agent spawn
      const agent = await runtime.agentSpawn({ type: "coder", name: "test-worker" })
      expect(agent.success).toBe(true)
      expect(agent.name).toBe("test-worker")

      //#when - memory operations
      const stored = await runtime.memoryStore({ key: "test/key", value: "test value" })
      expect(stored.success).toBe(true)
      expect(stored.key).toBe("test/key")

      const searched = await runtime.memorySearch({ query: "jwt" })
      expect(searched.success).toBe(true)
      expect(searched.results.length).toBe(1)
      expect(searched.results[0].key).toBe("auth/jwt")

      const retrieved = await runtime.memoryRetrieve({ key: "test/key" })
      expect(retrieved.success).toBe(true)
      expect(retrieved.value).toBe("Retrieved value")

      //#when - hive-mind consensus
      const consensus = await runtime.hiveMindConsensus({ question: "Which pattern?" })
      expect(consensus.success).toBe(true)
      expect(consensus.decision).toBe("Use adapter pattern")
      expect(consensus.confidence).toBe(0.92)

      //#when - security scan
      const scan = await runtime.securityScan({ depth: "standard" })
      expect(scan.success).toBe(true)
      expect(scan.summary.total).toBe(1)
      expect(scan.summary.medium).toBe(1)
      expect(scan.findings.length).toBe(1)

      //#when - stop
      await runtime.stop()

      //#then - stopped
      expect(runtime.isRunning()).toBe(false)
      expect(runtime.getHealth().status).toBe("stopped")
    })
  })

  describe("error path — claude-flow not installed", () => {
    it("surfaces CF_NOT_INSTALLED when version check fails", async () => {
      //#given
      const execFn = createFakeClaudeFlow({
        versionResult: { exitCode: 1, stdout: "", stderr: "command not found" },
      })
      runtime = new ClaudeFlowRuntime(
        { enabled: true, runtime: "external", healthCheckIntervalMs: 0 },
        { execFn },
      )

      //#when
      const started = await runtime.start()

      //#then
      expect(started).toBe(false)
      expect(runtime.isRunning()).toBe(false)
      expect(runtime.getHealth().status).toBe("error")
      expect(runtime.getHealth().error).toContain(CF_NOT_INSTALLED)
    })
  })

  describe("error path — disabled by config", () => {
    it("returns false and stays stopped when disabled", async () => {
      //#given
      runtime = new ClaudeFlowRuntime(
        { enabled: false, healthCheckIntervalMs: 0 },
        { execFn: createFakeClaudeFlow() },
      )

      //#when
      const started = await runtime.start()

      //#then
      expect(started).toBe(false)
      expect(runtime.isRunning()).toBe(false)
      expect(runtime.getHealth().status).toBe("stopped")
    })
  })

  describe("swarm stop", () => {
    it("returns true when swarm stop succeeds", async () => {
      //#given
      const execFn = createFakeClaudeFlow()
      runtime = new ClaudeFlowRuntime(
        { enabled: true, runtime: "external", healthCheckIntervalMs: 0 },
        { execFn },
      )
      await runtime.start()

      //#when
      const stopped = await runtime.swarmStop()

      //#then
      expect(stopped).toBe(true)
    })
  })

  describe("doctor", () => {
    it("returns success and output", async () => {
      //#given
      const execFn = createFakeClaudeFlow()
      runtime = new ClaudeFlowRuntime(
        { enabled: true, runtime: "external", healthCheckIntervalMs: 0 },
        { execFn },
      )
      await runtime.start()

      //#when
      const result = await runtime.doctor()

      //#then
      // doctor command is "unknown" to our fake, so exitCode=1
      expect(result.success).toBe(false)
    })
  })
})
