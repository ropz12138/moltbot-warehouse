/**
 * Lark Message Monitor
 *
 * Listens for incoming messages via WebSocket or webhook
 * and routes them to the Moltbot message handler.
 */

import type { WSClient } from "@larksuiteoapi/node-sdk";

import { createLarkWSClient, createEventDispatcher } from "./client.js";
import { getLarkRuntime } from "./runtime.js";
import { startWebhookServer } from "./webhook.js";
import type {
  ResolvedLarkAccount,
  LarkMessageEvent,
  ParsedMessage,
} from "./types.js";

// Active connections for cleanup
let activeWsClient: WSClient | null = null;
let activeWebhookServer: { stop: () => void } | null = null;

/**
 * Extract plain text from Lark message content.
 * Handles different message types (text, post/rich-text).
 */
function extractText(content: string, messageType: string): string {
  try {
    const parsed = JSON.parse(content);

    if (messageType === "text") {
      return parsed.text ?? "";
    }

    if (messageType === "post") {
      // Rich text - flatten and extract text elements
      if (Array.isArray(parsed.content)) {
        return parsed.content
          .flat()
          .filter((item: { tag: string }) => item.tag === "text")
          .map((item: { text: string }) => item.text)
          .join("");
      }
      return parsed.title ?? "";
    }

    // Unsupported message type - return placeholder
    return `[${messageType} message]`;
  } catch {
    // If JSON parsing fails, return raw content
    return content;
  }
}

/**
 * Parse Lark message event into normalized format.
 * Returns null for empty or invalid messages.
 */
function parseMessage(event: LarkMessageEvent): ParsedMessage | null {
  const { message, sender } = event;
  const text = extractText(message.content, message.message_type);

  if (!text.trim()) {
    return null;
  }

  return {
    messageId: message.message_id,
    chatId: message.chat_id,
    chatType: message.chat_type,
    senderId: sender.sender_id.open_id,
    senderType: sender.sender_type,
    text,
    threadId: message.root_id,
    mentions: (message.mentions ?? []).map((m) => ({
      id: m.id.open_id,
      name: m.name,
    })),
    timestamp: parseInt(message.create_time, 10),
  };
}

/**
 * Route incoming message to Moltbot handler.
 */
async function routeMessage(
  event: LarkMessageEvent,
  account: ResolvedLarkAccount
): Promise<void> {
  const api = getLarkRuntime();

  const parsed = parseMessage(event);
  if (!parsed) {
    api.logger.debug("[lark] Skipping empty or unparseable message");
    return;
  }

  api.logger.info(
    `[lark] Received message from ${parsed.senderId} in ${parsed.chatType} ${parsed.chatId}`
  );

  await api.inbound.handleMessage({
    channel: "lark",
    accountId: account.accountId,
    messageId: parsed.messageId,
    chatId: parsed.chatId,
    chatType: parsed.chatType === "p2p" ? "direct" : "group",
    senderId: parsed.senderId,
    text: parsed.text,
    threadId: parsed.threadId,
    timestamp: parsed.timestamp,
    raw: event,
  });
}

/**
 * Start WebSocket connection and listen for messages.
 */
function startWebSocket(
  account: ResolvedLarkAccount,
  abortSignal?: AbortSignal
): void {
  const api = getLarkRuntime();

  api.logger.info(`[lark] Starting WebSocket connection for account: ${account.accountId}`);

  const wsClient = createLarkWSClient(account);
  activeWsClient = wsClient;

  const dispatcher = createEventDispatcher(
    account.encryptKey,
    account.verificationToken
  );

  // Register message event handler
  dispatcher.register({
    "im.message.receive_v1": async (data) => {
      try {
        await routeMessage(data as LarkMessageEvent, account);
      } catch (error) {
        api.logger.error(`[lark] Error handling message: ${error}`);
      }
    },
  });

  // Start the connection
  wsClient.start({ eventDispatcher: dispatcher });

  // Handle abort signal for graceful shutdown
  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        api.logger.info("[lark] Stopping WebSocket (abort signal received)");
        stopMonitor();
      },
      { once: true }
    );
  }

  api.logger.info("[lark] WebSocket connection established");
}

/**
 * Start monitoring for Lark messages.
 *
 * Supports both WebSocket and webhook modes:
 * - WebSocket: Long connection (enterprise accounts)
 * - Webhook: HTTP callback (individual accounts, requires ngrok)
 */
export async function monitorLarkProvider(options: {
  account: ResolvedLarkAccount;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { account, abortSignal } = options;
  const api = getLarkRuntime();

  if (account.connectionMode === "websocket") {
    startWebSocket(account, abortSignal);
    return;
  }

  // Webhook mode - start HTTP server
  api.logger.info("[lark] Starting webhook server for individual account");

  const webhookServer = startWebhookServer(account, account.webhookPort);
  activeWebhookServer = webhookServer;

  // Handle abort signal for graceful shutdown
  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        api.logger.info("[lark] Stopping webhook server (abort signal received)");
        webhookServer.stop();
        activeWebhookServer = null;
      },
      { once: true }
    );
  }
}

/**
 * Stop the active monitor connection.
 */
export function stopMonitor(): void {
  if (activeWsClient) {
    activeWsClient = null;
  }
  if (activeWebhookServer) {
    activeWebhookServer.stop();
    activeWebhookServer = null;
  }
}
