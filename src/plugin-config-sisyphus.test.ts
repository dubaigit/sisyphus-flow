/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadPluginConfig } from "./plugin-config";

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function writeJsonc(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, "utf-8");
}

describe("plugin-config: sisyphus-flow config resolution", () => {
  let tempRoot: string;
  let userConfigDir: string;
  let projectDir: string;
  let originalOpenCodeConfigDir: string | undefined;

  beforeEach(() => {
    originalOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;

    tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "sisyphus-flow-config-resolution-")
    );
    userConfigDir = path.join(tempRoot, "user-config");
    projectDir = path.join(tempRoot, "project");

    fs.mkdirSync(userConfigDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    process.env.OPENCODE_CONFIG_DIR = userConfigDir;
  });

  afterEach(() => {
    if (originalOpenCodeConfigDir !== undefined) {
      process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfigDir;
    } else {
      delete process.env.OPENCODE_CONFIG_DIR;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe("priority resolution", () => {
    it("prefers sisyphus-flow.json over oh-my-opencode.json at the same level", () => {
      //#given a project-level .opencode with both configs present (json)
      const opencodeDir = path.join(projectDir, ".opencode");
      fs.mkdirSync(opencodeDir, { recursive: true });

      writeJson(path.join(opencodeDir, "sisyphus-flow.json"), {
        default_run_agent: "from-sisyphus-flow",
      });
      writeJson(path.join(opencodeDir, "oh-my-opencode.json"), {
        default_run_agent: "from-oh-my-opencode",
      });

      //#when loading plugin config
      const config = loadPluginConfig(projectDir, {});

      //#then sisyphus-flow wins
      expect(config.default_run_agent).toBe("from-sisyphus-flow");
    });

    it("uses oh-my-opencode.json as fallback when sisyphus-flow.json is missing", () => {
      //#given a project-level .opencode with only the legacy config present (json)
      const opencodeDir = path.join(projectDir, ".opencode");
      fs.mkdirSync(opencodeDir, { recursive: true });

      writeJson(path.join(opencodeDir, "oh-my-opencode.json"), {
        default_run_agent: "from-oh-my-opencode",
      });

      //#when loading plugin config
      const config = loadPluginConfig(projectDir, {});

      //#then legacy config is used
      expect(config.default_run_agent).toBe("from-oh-my-opencode");
    });

    it("prefers sisyphus-flow.jsonc over oh-my-opencode.jsonc at the same level", () => {
      //#given a project-level .opencode with both configs present (jsonc)
      const opencodeDir = path.join(projectDir, ".opencode");
      fs.mkdirSync(opencodeDir, { recursive: true });

      writeJsonc(
        path.join(opencodeDir, "sisyphus-flow.jsonc"),
        `{
  // primary config
  "default_run_agent": "from-sisyphus-flow",
}`
      );
      writeJsonc(
        path.join(opencodeDir, "oh-my-opencode.jsonc"),
        `{
  // fallback config
  "default_run_agent": "from-oh-my-opencode",
}`
      );

      //#when loading plugin config
      const config = loadPluginConfig(projectDir, {});

      //#then sisyphus-flow wins
      expect(config.default_run_agent).toBe("from-sisyphus-flow");
    });

    it("uses oh-my-opencode.jsonc as fallback when sisyphus-flow.jsonc is missing", () => {
      //#given a project-level .opencode with only the legacy config present (jsonc)
      const opencodeDir = path.join(projectDir, ".opencode");
      fs.mkdirSync(opencodeDir, { recursive: true });

      writeJsonc(
        path.join(opencodeDir, "oh-my-opencode.jsonc"),
        `{
  // legacy config
  "default_run_agent": "from-oh-my-opencode",
}`
      );

      //#when loading plugin config
      const config = loadPluginConfig(projectDir, {});

      //#then legacy config is used
      expect(config.default_run_agent).toBe("from-oh-my-opencode");
    });
  });

  describe("claude_flow parsing", () => {
    it("parses the claude_flow config block with defaults", () => {
      //#given a user-level sisyphus-flow.json with a claude_flow block
      writeJson(path.join(userConfigDir, "sisyphus-flow.json"), {
        claude_flow: {
          enabled: true,
          runtime: "external",
          mcpPort: 4242,
          routingPolicy: {
            enabled: true,
          },
        },
      });

      //#when loading plugin config
      const config = loadPluginConfig(projectDir, {});

      //#then claude_flow is present and defaults are applied
      expect(config.claude_flow?.enabled).toBe(true);
      expect(config.claude_flow?.runtime).toBe("external");
      expect(config.claude_flow?.mcpPort).toBe(4242);
      expect(config.claude_flow?.versionPin).toBe("v3alpha");
      expect(config.claude_flow?.transport).toBe("mcp");
      expect(config.claude_flow?.autoStart).toBe(true);
      expect(config.claude_flow?.routingPolicy?.enabled).toBe(true);
      expect(config.claude_flow?.routingPolicy?.swarmCategories).toEqual([
        "ultrabrain",
      ]);
      expect(config.claude_flow?.routingPolicy?.localCategories).toEqual(["quick"]);
      expect(config.claude_flow?.routingPolicy?.defaultExecutor).toBe("local");
    });

    it("still parses an old config without claude_flow", () => {
      //#given a user-level sisyphus-flow.json without claude_flow
      writeJson(path.join(userConfigDir, "sisyphus-flow.json"), {
        default_run_agent: "from-sisyphus-flow",
      });

      //#when loading plugin config
      const config = loadPluginConfig(projectDir, {});

      //#then config loads and claude_flow remains undefined
      expect(config.default_run_agent).toBe("from-sisyphus-flow");
      expect(config.claude_flow).toBeUndefined();
    });
  });
});
