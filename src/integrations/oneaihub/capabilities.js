import {RADAR_SETTINGS} from "../../config/radar.generated.js";

// OneAIHUB is an optional private gateway, never a prerequisite for core RSS/API collection.
// Cloudflare VPC + secret credentials are detected at runtime; local settings alone grant no access.
export function oneAIHubCapabilities(env = {}, settings = RADAR_SETTINGS) {
  const config = settings.integrations.oneaihub;
  const configured = config.enabled === true;
  const transport = Boolean(env.ONEAIHUB_VPC && typeof env.ONEAIHUB_VPC.fetch === "function");
  const authorized = Boolean(env.ONEAIHUB_MCP_BEARER_TOKEN ||
    (env.ONEAIHUB_MCP_CLIENT_ID && env.ONEAIHUB_MCP_CLIENT_SECRET));
  const available = configured && transport && authorized;
  const browser = available && config.browser.enabled;
  const computer = available && config.computer.enabled;
  return {
    enabled: configured,
    available,
    browser,
    computer,
    filesystem: computer && config.computer.allowFilesystem,
    commands: computer && config.computer.allowCommands,
    reason: !configured ? "disabled_by_configuration" :
      !transport ? "vpc_binding_unavailable" :
      !authorized ? "credentials_unavailable" : "ready"
  };
}

export const hasBrowserOneAIHub = (env, settings) =>
  oneAIHubCapabilities(env, settings).browser;
