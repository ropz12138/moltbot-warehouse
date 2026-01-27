/**
 * Lark Plugin Type Definitions
 *
 * Core types for Lark/Feishu integration with Moltbot.
 * Designed for clarity and minimal redundancy.
 */

// Domain and connection configuration
export type LarkDomain = "lark" | "feishu";
export type LarkConnectionMode = "websocket" | "webhook";

// Access control policies
export type DmPolicy = "open" | "pairing" | "allowlist";
export type GroupPolicy = "open" | "allowlist" | "disabled";

/**
 * Raw account configuration from channels.lark.accounts.<id>
 * All fields are optional - defaults applied during resolution.
 */
export interface LarkAccountConfig {
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
  domain?: LarkDomain;
  connectionMode?: LarkConnectionMode;
  webhookPort?: number;
  dmPolicy?: DmPolicy;
  dmAllowlist?: string[];
  groupPolicy?: GroupPolicy;
  groupMentionGated?: boolean;
  groupAllowlist?: string[];
  historyLimit?: number;
}

/**
 * Fully resolved account with all defaults applied.
 * Used throughout the plugin after initial resolution.
 */
export interface ResolvedLarkAccount {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  domain: LarkDomain;
  connectionMode: LarkConnectionMode;
  webhookPort: number;
  dmPolicy: DmPolicy;
  dmAllowlist: string[];
  groupPolicy: GroupPolicy;
  groupMentionGated: boolean;
  groupAllowlist: string[];
  historyLimit: number;
}

/**
 * Top-level Lark channel configuration in channels.lark
 */
export interface LarkChannelConfig {
  enabled?: boolean;
  accounts?: Record<string, LarkAccountConfig>;
}

/**
 * Lark message event payload from im.message.receive_v1
 * Matches the official Lark SDK event structure.
 */
export interface LarkMessageEvent {
  sender: {
    sender_id: {
      open_id: string;
      user_id?: string;
      union_id?: string;
    };
    sender_type: string;
    tenant_key: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time: string;
    update_time?: string;
    chat_id: string;
    chat_type: "p2p" | "group";
    message_type: string;
    content: string;
    mentions?: LarkMention[];
  };
}

/**
 * Mention data within a Lark message
 */
export interface LarkMention {
  key: string;
  id: {
    open_id: string;
    user_id?: string;
    union_id?: string;
  };
  name: string;
  tenant_key: string;
}

/**
 * Normalized message after parsing Lark event
 */
export interface ParsedMessage {
  messageId: string;
  chatId: string;
  chatType: "p2p" | "group";
  senderId: string;
  senderType: string;
  text: string;
  threadId?: string;
  mentions: Array<{ id: string; name: string }>;
  timestamp: number;
}

/**
 * Result from sending a message
 */
export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}
