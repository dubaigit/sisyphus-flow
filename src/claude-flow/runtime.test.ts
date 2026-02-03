/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { CF_NOT_INSTALLED, ClaudeFlowRuntime } from "./runtime"
import { DEFAULT_CLAUDE_FLOW_CONFIG, type ExecFn, type SpawnFn } from "./types"

type ExecCall = { args: string[]; timeoutMs?: number }

function createMockExec(handlers?: {
  onVersion?: () => Promise<{ exitCode: number; stdout: string; stderr: string }>
  onHelp?: (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  onOther?: (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
}): { execFn: ExecFn; calls: ExecCall[] } {
  const calls: ExecCall[] = []

  const execFn: ExecFn = async (args, timeoutMs) => {
    calls.push({ args, timeoutMs })

    if (args.length === 1 && args[0] === "--version") {
      return handlers?.onVersion
        ? handlers.onVersion()
        : { exitCode: 0, stdout: "3.1.0", stderr: "" }
    }

    if (args.length === 2 && args[1] === "--help") {
      return handlers?.onHelp
        ? handlers.onHelp(args)
        : { exitCode: 0, stdout: "", stderr: "" }
    }

    return handlers?.onOther
      ? handlers.onOther(args)
      : { exitCode: 0, stdout: "", stderr: "" }
  }

  return { execFn, calls }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("ClaudeFlowRuntime lifecycle", () => {
  let runtime: ClaudeFlowRuntime

  beforeEach(() => {
    const { execFn } = createMockExec()
    runtime = new ClaudeFlowRuntime({ healthCheckIntervalMs: 0 }, { execFn })
  })

  afterEach(async () => {
    await runtime.stop()
  })

  it("constructor defaults — creates with DEFAULT_CLAUDE_FLOW_CONFIG when no args", () => {
    //#given
    const { execFn } = createMockExec()

    //#when
    const rt = new ClaudeFlowRuntime(undefined, { execFn })

    //#then
    expect(rt.getConfig()).toEqual(DEFAULT_CLAUDE_FLOW_CONFIG)
  })

  it("start() returns false when disabled", async () => {
    //#given
    const { execFn, calls } = createMockExec()
    runtime = new ClaudeFlowRuntime({ enabled: false, healthCheckIntervalMs: 0 }, { execFn })

    //#when
    const started = await runtime.start()

    //#then
    expect(started).toBe(false)
    expect(calls.length).toBe(0)
    expect(runtime.isRunning()).toBe(false)
    expect(runtime.getHealth().status).toBe("stopped")
  })

  it("start() returns false when version check fails", async () => {
    //#given
    const { execFn } = createMockExec({
      onVersion: async () => ({ exitCode: 1, stdout: "", stderr: "nope" }),
    })
    runtime = new ClaudeFlowRuntime({ enabled: true, runtime: "external", healthCheckIntervalMs: 0 }, { execFn })

    //#when
    const started = await runtime.start()

    //#then
    expect(started).toBe(false)
    expect(runtime.isRunning()).toBe(false)
    const health = runtime.getHealth()
    expect(health.status).toBe("error")
    expect(health.error).toContain(CF_NOT_INSTALLED)
  })

  it("start() returns true when version check succeeds and probes pass", async () => {
    //#given
    const { execFn } = createMockExec()
    runtime = new ClaudeFlowRuntime({ enabled: true, runtime: "external", healthCheckIntervalMs: 0 }, { execFn })

    //#when
    const started = await runtime.start()

    //#then
    expect(started).toBe(true)
    expect(runtime.isRunning()).toBe(true)
    const health = runtime.getHealth()
    expect(health.status).toBe("running")
    expect(health.version).toBe("3.1.0")
    expect(typeof health.uptime).toBe("number")
    expect(health.error).toBe(null)
    expect(health.capabilities).toEqual({
      swarm: true,
      memory: true,
      hiveMind: true,
      security: true,
      neural: true,
      plugins: true,
      mcp: true,
    })
  })

  it("start() is idempotent — second call returns true without re-starting", async () => {
    //#given
    const { execFn, calls } = createMockExec()
    runtime = new ClaudeFlowRuntime({ enabled: true, runtime: "external", healthCheckIntervalMs: 0 }, { execFn })

    //#when
    const first = await runtime.start()
    const callCountAfterFirst = calls.length
    const second = await runtime.start()

    //#then
    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(calls.length).toBe(callCountAfterFirst)
  })

  it("stop() is safe to call multiple times", async () => {
    //#given
    const { execFn } = createMockExec()
    runtime = new ClaudeFlowRuntime({ enabled: true, runtime: "external", healthCheckIntervalMs: 0 }, { execFn })
    await runtime.start()

    //#when
    await runtime.stop()
    await runtime.stop()

    //#then
    expect(runtime.isRunning()).toBe(false)
    expect(runtime.getHealth().status).toBe("stopped")
  })

  it("stop() is safe to call when never started", async () => {
    //#given
    const { execFn } = createMockExec()
    runtime = new ClaudeFlowRuntime({ enabled: true, runtime: "external", healthCheckIntervalMs: 0 }, { execFn })

    //#when
    await runtime.stop()
    await runtime.stop()

    //#then
    expect(runtime.isRunning()).toBe(false)
    expect(runtime.getHealth().status).toBe("stopped")
  })

  it("isRunning() returns correct state through lifecycle", async () => {
    //#given
    const version = createDeferred<{ exitCode: number; stdout: string; stderr: string }>()
    const { execFn } = createMockExec({
      onVersion: async () => version.promise,
    })
    runtime = new ClaudeFlowRuntime({ enabled: true, runtime: "external", healthCheckIntervalMs: 0 }, { execFn })

    //#when
    const startPromise = runtime.start()

    //#then
    expect(runtime.isRunning()).toBe(false)
    expect(runtime.getHealth().status).toBe("starting")

    //#when
    version.resolve({ exitCode: 0, stdout: "3.1.0", stderr: "" })
    const started = await startPromise

    //#then
    expect(started).toBe(true)
    expect(runtime.isRunning()).toBe(true)

    //#when
    await runtime.stop()

    //#then
    expect(runtime.isRunning()).toBe(false)
    expect(runtime.getHealth().status).toBe("stopped")
  })

  it("getHealth() reflects status changes", async () => {
    //#given
    const version = createDeferred<{ exitCode: number; stdout: string; stderr: string }>()
    const { execFn } = createMockExec({
      onVersion: async () => version.promise,
    })
    runtime = new ClaudeFlowRuntime({ enabled: true, runtime: "external", healthCheckIntervalMs: 0 }, { execFn })

    //#when
    const startPromise = runtime.start()

    //#then
    expect(runtime.getHealth().status).toBe("starting")

    //#when
    version.resolve({ exitCode: 0, stdout: "3.1.0", stderr: "" })
    await startPromise

    //#then
    expect(runtime.getHealth().status).toBe("running")

    //#when
    await runtime.stop()

    //#then
    expect(runtime.getHealth().status).toBe("stopped")
  })

  it("when execFn simulates spawn failure, health status is 'error'", async () => {
    //#given
    const { execFn } = createMockExec({
      onVersion: async () => {
        throw new Error("spawn failed")
      },
    })
    runtime = new ClaudeFlowRuntime({ enabled: true, runtime: "external", healthCheckIntervalMs: 0 }, { execFn })

    //#when
    const started = await runtime.start()

    //#then
    expect(started).toBe(false)
    const health = runtime.getHealth()
    expect(health.status).toBe("error")
    expect(health.error).toContain("[CF_NOT_INSTALLED]")
  })

  it("config command option is respected in subprocess invocations", async () => {
    //#given
    const customCommand = ["bunx", "claude-flow@3.1.0"]
    const { execFn } = createMockExec()
    let spawnedCmd: string[] | null = null

    const spawnFn: SpawnFn = (opts) => {
      if (typeof opts === "object" && opts !== null && "cmd" in opts) {
        const cmd = (opts as Record<string, unknown>).cmd
        if (Array.isArray(cmd) && cmd.every(x => typeof x === "string")) {
          spawnedCmd = cmd
        }
      }
      throw new Error("spawn fail")
    }

    runtime = new ClaudeFlowRuntime(
      {
        enabled: true,
        runtime: "managed",
        autoStart: true,
        healthCheckIntervalMs: 0,
        mcpPort: 4555,
        command: customCommand,
      },
      { execFn, spawnFn }
    )

    //#when
    const started = await runtime.start()

    //#then
    expect(started).toBe(true)
    expect(runtime.getConfig().command).toEqual(customCommand)
    expect(spawnedCmd).toEqual([...customCommand, "daemon", "start", "--port", "4555"])
  })
})
