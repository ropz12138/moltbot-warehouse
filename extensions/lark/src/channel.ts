/**
 * Lark Channel Plugin
 *
 * Implements the ChannelPlugin interface for Lark/Feishu integration.
 * Provides account configuration, message sending, and gateway management.
 */

import type { ChannelPlugin, MoltbotConfig } from "clawdbot/plugin-sdk";

import { createLarkClient } from "./client.js";
import { getLarkRuntime } from "./runtime.js";
import { monitorLarkProvider } from "./monitor.js";
import type {
  ResolvedLarkAccount,
  LarkAccountConfig,
  LarkChannelConfig,
  SendResult,
} from "./types.js";

// Default values for account configuration
const DEFAULTS = {
  domain: "lark" as const,
  connectionMode: "websocket" as const,
  webhookPort: 3000,
  dmPolicy: "pairing" as const,
  groupPolicy: "open" as const,
  groupMentionGated: true,
  historyLimit: 10,
} as const;

/**
 * Extract Lark channel config from Moltbot config
 */
function getChannelConfig(cfg: MoltbotConfig): LarkChannelConfig {
  return (cfg.channels?.lark as LarkChannelConfig) ?? {};
}

/**
 * Get account config from channel config, with empty object fallback
 */
function getAccountConfig(
  channelConfig: LarkChannelConfig,
  accountId: string
): LarkAccountConfig {
  return channelConfig.accounts?.[accountId] ?? {};
}

/**
 * Check if default account has env var credentials configured
 */
function hasEnvCredentials(): boolean {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
}

/**
 * Resolve account configuration with defaults and env fallbacks.
 * For "default" account, environment variables take precedence.
 */
function resolveAccount(
  cfg: MoltbotConfig,
  accountId: string
): ResolvedLarkAccount | null {
  const channelConfig = getChannelConfig(cfg);
  const accountConfig = getAccountConfig(channelConfig, accountId);

  // Resolve credentials - env vars as fallback for default account
  const isDefault = accountId === "default";
  const appId = accountConfig.appId ?? (isDefault ? process.env.LARK_APP_ID : undefined);
  const appSecret = accountConfig.appSecret ?? (isDefault ? process.env.LARK_APP_SECRET : undefined);
  const encryptKey = accountConfig.encryptKey ?? (isDefault ? process.env.LARK_ENCRYPT_KEY : undefined);
  const verificationToken = accountConfig.verificationToken ?? (isDefault ? process.env.LARK_VERIFICATION_TOKEN : undefined);

  const configured = Boolean(appId?.trim() && appSecret?.trim());

  return {
    accountId,
    enabled: accountConfig.enabled ?? true,
    configured,
    appId: appId ?? "",
    appSecret: appSecret ?? "",
    encryptKey,
    verificationToken,
    domain: accountConfig.domain ?? DEFAULTS.domain,
    connectionMode: accountConfig.connectionMode ?? DEFAULTS.connectionMode,
    webhookPort: accountConfig.webhookPort ?? DEFAULTS.webhookPort,
    dmPolicy: accountConfig.dmPolicy ?? DEFAULTS.dmPolicy,
    dmAllowlist: accountConfig.dmAllowlist ?? [],
    groupPolicy: accountConfig.groupPolicy ?? DEFAULTS.groupPolicy,
    groupMentionGated: accountConfig.groupMentionGated ?? DEFAULTS.groupMentionGated,
    groupAllowlist: accountConfig.groupAllowlist ?? [],
    historyLimit: accountConfig.historyLimit ?? DEFAULTS.historyLimit,
  };
}

/**
 * Determine receive_id_type from recipient ID format.
 * IDs starting with "oc_" are chat IDs, otherwise open IDs.
 */
function inferReceiveIdType(recipientId: string): "chat_id" | "open_id" {
  return recipientId.startsWith("oc_") ? "chat_id" : "open_id";
}

/**
 * Send a text message via Lark API
 */
async function sendTextMessage(
  account: ResolvedLarkAccount,
  recipientId: string,
  text: string,
  threadId?: string
): Promise<SendResult> {
  try {
    const client = createLarkClient(account);

    const response = await client.im.message.create({
      params: {
        receive_id_type: inferReceiveIdType(recipientId),
      },
      data: {
        receive_id: recipientId,
        msg_type: "text",
        content: JSON.stringify({ text }),
        ...(threadId && { root_id: threadId }),
      },
    });

    if (response.code === 0 && response.data) {
      return { ok: true, messageId: response.data.message_id };
    }

    return { ok: false, error: response.msg ?? "Unknown error" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * List available chat groups
 */
async function listGroups(
  account: ResolvedLarkAccount
): Promise<Array<{ id: string; name: string }>> {
  try {
    const client = createLarkClient(account);

    const response = await client.im.chat.list({
      params: { page_size: 100 },
    });

    if (response.code === 0 && response.data?.items) {
      return response.data.items.map((chat) => ({
        id: chat.chat_id ?? "",
        name: chat.name ?? "Unknown",
      }));
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Lark channel plugin implementation
 */
export const larkPlugin: ChannelPlugin<ResolvedLarkAccount> = {
  id: "lark",

  meta: {
    label: "Lark",
    selectionLabel: "Lark (Larksuite)",
    docsPath: "/channels/lark",
    blurb: "Chat with your bot on Lark (Larksuite)",
    order: 75,
  },

  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: true,
    media: true,
    nativeCommands: false,
    streamingBlocked: false,
  },

  config: {
    listAccountIds(cfg: MoltbotConfig): string[] {
      const channelConfig = getChannelConfig(cfg);
      const accountIds = Object.keys(channelConfig.accounts ?? {});

      // Include default account if env vars are configured
      if (!accountIds.includes("default") && hasEnvCredentials()) {
        accountIds.push("default");
      }

      return accountIds;
    },

    resolveAccount(cfg: MoltbotConfig, accountId?: string): ResolvedLarkAccount | null {
      return resolveAccount(cfg, accountId ?? "default");
    },

    isConfigured(account: ResolvedLarkAccount): boolean {
      return account.configured;
    },

    setAccountEnabled(
      cfg: MoltbotConfig,
      accountId: string,
      enabled: boolean
    ): MoltbotConfig {
      const channelConfig = getChannelConfig(cfg);

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          lark: {
            ...channelConfig,
            accounts: {
              ...channelConfig.accounts,
              [accountId]: {
                ...channelConfig.accounts?.[accountId],
                enabled,
              },
            },
          },
        },
      };
    },
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    chunkerMode: "markdown",

    async sendText({ account, recipientId, text, threadId }): Promise<SendResult> {
      return sendTextMessage(account, recipientId, text, threadId);
    },
  },

  gateway: {
    async startAccount({ account, abortSignal }) {
      const api = getLarkRuntime();

      if (!account.configured) {
        api.logger.warn(`[lark] Account ${account.accountId} not configured`);
        return;
      }

      if (!account.enabled) {
        api.logger.debug(`[lark] Account ${account.accountId} disabled`);
        return;
      }

      api.logger.info(
        `[lark] Starting provider: account=${account.accountId}, mode=${account.connectionMode}, domain=${account.domain}`
      );

      await monitorLarkProvider({ account, abortSignal });
    },
  },

  directory: {
    async listPeers() {
      // Lark does not provide a simple user directory API
      return [];
    },

    async listGroups(account) {
      return listGroups(account);
    },

    async resolveSelf() {
      return null;
    },
  },

  dmPolicy: {
    mode(cfg: MoltbotConfig) {
      const channelConfig = getChannelConfig(cfg);
      return channelConfig.accounts?.default?.dmPolicy ?? DEFAULTS.dmPolicy;
    },

    allowlist(cfg: MoltbotConfig) {
      const channelConfig = getChannelConfig(cfg);
      return channelConfig.accounts?.default?.dmAllowlist ?? [];
    },
  },

  groupPolicy: {
    mode(cfg: MoltbotConfig) {
      const channelConfig = getChannelConfig(cfg);
      return channelConfig.accounts?.default?.groupPolicy ?? DEFAULTS.groupPolicy;
    },

    mentionGated(cfg: MoltbotConfig) {
      const channelConfig = getChannelConfig(cfg);
      return channelConfig.accounts?.default?.groupMentionGated ?? DEFAULTS.groupMentionGated;
    },

    allowlist(cfg: MoltbotConfig) {
      const channelConfig = getChannelConfig(cfg);
      return channelConfig.accounts?.default?.groupAllowlist ?? [];
    },
  },

  setup: {
    validate(account: ResolvedLarkAccount): string[] {
      const errors: string[] = [];

      if (!account.appId?.trim()) {
        errors.push(
          "App ID is required. Set via channels.lark.accounts.<id>.appId or LARK_APP_ID env var."
        );
      }

      if (!account.appSecret?.trim()) {
        errors.push(
          "App Secret is required. Set via channels.lark.accounts.<id>.appSecret or LARK_APP_SECRET env var."
        );
      }

      return errors;
    },
  },
};
