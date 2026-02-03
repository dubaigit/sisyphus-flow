import * as fs from "fs";
import * as path from "path";
import { OhMyOpenCodeConfigSchema, type OhMyOpenCodeConfig } from "./config";
import {
  log,
  deepMerge,
  getOpenCodeConfigDir,
  addConfigLoadError,
  parseJsonc,
  detectConfigFile,
  migrateConfigFile,
} from "./shared";

export function loadConfigFromPath(
  configPath: string,
  ctx: unknown
): OhMyOpenCodeConfig | null {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      const rawConfig = parseJsonc<Record<string, unknown>>(content);

      migrateConfigFile(configPath, rawConfig);

      const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig);

      if (!result.success) {
        const errorMsg = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(", ");
        log(`Config validation error in ${configPath}:`, result.error.issues);
        addConfigLoadError({
          path: configPath,
          error: `Validation error: ${errorMsg}`,
        });
        return null;
      }

      log(`Config loaded from ${configPath}`, { agents: result.data.agents });
      return result.data;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(`Error loading config from ${configPath}:`, err);
    addConfigLoadError({ path: configPath, error: errorMsg });
  }
  return null;
}

export function mergeConfigs(
  base: OhMyOpenCodeConfig,
  override: OhMyOpenCodeConfig
): OhMyOpenCodeConfig {
  return {
    ...base,
    ...override,
    agents: deepMerge(base.agents, override.agents),
    categories: deepMerge(base.categories, override.categories),
    disabled_agents: [
      ...new Set([
        ...(base.disabled_agents ?? []),
        ...(override.disabled_agents ?? []),
      ]),
    ],
    disabled_mcps: [
      ...new Set([
        ...(base.disabled_mcps ?? []),
        ...(override.disabled_mcps ?? []),
      ]),
    ],
    disabled_hooks: [
      ...new Set([
        ...(base.disabled_hooks ?? []),
        ...(override.disabled_hooks ?? []),
      ]),
    ],
    disabled_commands: [
      ...new Set([
        ...(base.disabled_commands ?? []),
        ...(override.disabled_commands ?? []),
      ]),
    ],
    disabled_skills: [
      ...new Set([
        ...(base.disabled_skills ?? []),
        ...(override.disabled_skills ?? []),
      ]),
    ],
    claude_code: deepMerge(base.claude_code, override.claude_code),
    claude_flow: deepMerge(base.claude_flow, override.claude_flow),
  };
}

/**
 * Resolve config file path with priority:
 *   1. sisyphus-flow.json[c] (primary)
 *   2. oh-my-opencode.json[c] (backward-compat fallback)
 */
function resolveConfigPath(baseDir: string, subPath: string): string {
  // Try sisyphus-flow first
  const sfBasePath = path.join(baseDir, subPath, "sisyphus-flow");
  const sfDetected = detectConfigFile(sfBasePath);
  if (sfDetected.format !== "none") {
    log(`Config found at ${sfDetected.path} (sisyphus-flow)`);
    return sfDetected.path;
  }

  // Fallback to oh-my-opencode
  const omoBasePath = path.join(baseDir, subPath, "oh-my-opencode");
  const omoDetected = detectConfigFile(omoBasePath);
  if (omoDetected.format !== "none") {
    log(`Config found at ${omoDetected.path} (oh-my-opencode fallback)`);
    return omoDetected.path;
  }

  // Default to sisyphus-flow.json (will be created if needed)
  return sfBasePath + ".json";
}

export function loadPluginConfig(
  directory: string,
  ctx: unknown
): OhMyOpenCodeConfig {
  // User-level config path - sisyphus-flow.json[c] > oh-my-opencode.json[c]
  const configDir = getOpenCodeConfigDir({ binary: "opencode" });
  const userConfigPath = resolveConfigPath(configDir, "");

  // Project-level config path - sisyphus-flow.json[c] > oh-my-opencode.json[c]
  const projectConfigPath = resolveConfigPath(directory, ".opencode");

  // Load user config first (base)
  let config: OhMyOpenCodeConfig =
    loadConfigFromPath(userConfigPath, ctx) ?? {};

  // Override with project config
  const projectConfig = loadConfigFromPath(projectConfigPath, ctx);
  if (projectConfig) {
    config = mergeConfigs(config, projectConfig);
  }

  config = {
    ...config,
  };

  log("Final merged config", {
    agents: config.agents,
    disabled_agents: config.disabled_agents,
    disabled_mcps: config.disabled_mcps,
    disabled_hooks: config.disabled_hooks,
    claude_code: config.claude_code,
    claude_flow: config.claude_flow,
  });
  return config;
}
