/**
 * Moltbot Lark Plugin
 *
 * Provides Lark/Feishu (Larksuite) messaging integration.
 * Supports WebSocket-based real-time messaging with direct
 * messages and group chats.
 */

import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";

import { larkPlugin } from "./src/channel.js";
import { setLarkRuntime } from "./src/runtime.js";

// Re-export for programmatic usage
export { larkPlugin } from "./src/channel.js";
export { createLarkClient, createLarkWSClient } from "./src/client.js";
export { monitorLarkProvider, stopMonitor } from "./src/monitor.js";
export { startWebhookServer } from "./src/webhook.js";
export type {
  LarkDomain,
  LarkConnectionMode,
  LarkAccountConfig,
  ResolvedLarkAccount,
  LarkChannelConfig,
  LarkMessageEvent,
  ParsedMessage,
  SendResult,
} from "./src/types.js";

const plugin = {
  id: "lark",
  name: "Lark",
  description: "Lark (Larksuite) channel plugin for Moltbot",
  configSchema: emptyPluginConfigSchema(),
  register(api: MoltbotPluginApi) {
    setLarkRuntime(api);
    api.registerChannel({ plugin: larkPlugin });
  },
};

export default plugin;
