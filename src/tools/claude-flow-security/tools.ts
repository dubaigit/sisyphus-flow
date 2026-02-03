/**
 * Claude-Flow Security Tools
 *
 * Vulnerability scanning, OWASP compliance, and auto-fix via claude-flow.
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { getClaudeFlowRuntime, CF_UNAVAILABLE_PREFIX } from "../../claude-flow"

const CF_UNAVAILABLE = `${CF_UNAVAILABLE_PREFIX} Claude-Flow runtime not available. Enable it in sisyphus-flow.json: { "claude_flow": { "enabled": true } }`

function requireRuntime() {
  const runtime = getClaudeFlowRuntime()
  if (!runtime || !runtime.isRunning()) return null
  return runtime
}

export const cf_security_scan: ToolDefinition = tool({
  description:
    "Run a security scan on the codebase using claude-flow's security module. " +
    "Detects CVEs, hardcoded secrets, SQL injection, XSS, CSRF, and more. " +
    "Outputs findings with severity levels and optional auto-fix.",
  args: {
    target: tool.schema
      .string()
      .default(".")
      .describe("Target path to scan (default: current directory)"),
    depth: tool.schema
      .enum(["quick", "standard", "deep", "full"])
      .default("standard")
      .describe("Scan depth: 'quick' for fast check, 'deep' for thorough analysis"),
    type: tool.schema
      .enum(["code", "deps", "container", "all"])
      .default("all")
      .describe("What to scan: code, dependencies, containers, or all"),
    fix: tool.schema
      .boolean()
      .default(false)
      .describe("Auto-fix safe issues (only applies fixes with high confidence)"),
  },
  execute: async (args) => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const result = await runtime.securityScan({
      target: args.target,
      depth: args.depth,
      type: args.type,
      fix: args.fix,
    })

    if (!result.success) {
      return `Security scan failed: ${result.error}`
    }

    const { summary, findings } = result

    if (summary.total === 0) {
      return "Security scan complete: No issues found."
    }

    const lines = [
      `Security Scan Results:`,
      `  Total: ${summary.total} | Critical: ${summary.critical} | High: ${summary.high} | Medium: ${summary.medium} | Low: ${summary.low}`,
      "",
    ]

    for (const finding of findings.slice(0, 20)) {
      lines.push(`[${finding.severity.toUpperCase()}] ${finding.type}`)
      lines.push(`  ${finding.description}`)
      if (finding.location) lines.push(`  Location: ${finding.location}`)
      if (finding.fix) lines.push(`  Fix: ${finding.fix}`)
      lines.push("")
    }

    if (findings.length > 20) {
      lines.push(`... and ${findings.length - 20} more findings.`)
    }

    return lines.join("\n")
  },
})
