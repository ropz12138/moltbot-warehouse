/**
 * Lark Plugin Runtime
 *
 * Manages the plugin API context provided by Moltbot.
 * The API is set once during plugin registration and
 * provides access to logging, inbound message handling, etc.
 */

import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

let pluginApi: MoltbotPluginApi | null = null;

/**
 * Initialize the Lark plugin with the API context.
 * Called once during plugin registration.
 */
export function setLarkRuntime(api: MoltbotPluginApi): void {
  pluginApi = api;
}

/**
 * Get the current plugin API.
 * Throws if called before plugin registration.
 */
export function getLarkRuntime(): MoltbotPluginApi {
  if (!pluginApi) {
    throw new Error(
      "Lark runtime not initialized. Ensure the plugin is properly registered."
    );
  }
  return pluginApi;
}

/**
 * Check if runtime has been initialized.
 * Useful for conditional logic without throwing.
 */
export function hasLarkRuntime(): boolean {
  return pluginApi !== null;
}
