/**
 * Lark SDK Client Factory
 *
 * Creates and caches Lark API clients. Supports both REST API
 * and WebSocket clients for different use cases.
 */

import * as Lark from "@larksuiteoapi/node-sdk";

import type { ResolvedLarkAccount, LarkDomain } from "./types.js";

// Cache key for client instances
type ClientCacheKey = `${string}:${string}:${LarkDomain}`;

// REST client cache - keyed by appId:appSecret:domain
const clientCache = new Map<ClientCacheKey, Lark.Client>();

/**
 * Convert domain string to Lark SDK enum
 */
function toLarkDomain(domain: LarkDomain): Lark.Domain {
  return domain === "feishu" ? Lark.Domain.Feishu : Lark.Domain.Lark;
}

/**
 * Generate cache key for an account
 */
function cacheKey(account: ResolvedLarkAccount): ClientCacheKey {
  return `${account.appId}:${account.appSecret}:${account.domain}`;
}

/**
 * Validate account has required credentials
 */
function validateCredentials(account: ResolvedLarkAccount): void {
  if (!account.appId || !account.appSecret) {
    throw new Error("Lark appId and appSecret are required");
  }
}

/**
 * Create or retrieve a cached Lark REST API client.
 *
 * Clients are cached by appId + appSecret + domain to allow
 * efficient reuse across multiple calls with the same account.
 */
export function createLarkClient(account: ResolvedLarkAccount): Lark.Client {
  validateCredentials(account);

  const key = cacheKey(account);
  const cached = clientCache.get(key);
  if (cached) {
    return cached;
  }

  const client = new Lark.Client({
    appId: account.appId,
    appSecret: account.appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: toLarkDomain(account.domain),
  });

  clientCache.set(key, client);
  return client;
}

/**
 * Create a Lark WebSocket client for long-lived connections.
 *
 * WebSocket clients are NOT cached because they manage their own
 * connection lifecycle and should be created fresh for each session.
 */
export function createLarkWSClient(account: ResolvedLarkAccount): Lark.WSClient {
  validateCredentials(account);

  return new Lark.WSClient({
    appId: account.appId,
    appSecret: account.appSecret,
    domain: toLarkDomain(account.domain),
    loggerLevel: Lark.LoggerLevel.info,
  });
}

/**
 * Create an event dispatcher for handling Lark webhook/websocket events.
 */
export function createEventDispatcher(
  encryptKey?: string,
  verificationToken?: string
): Lark.EventDispatcher {
  return new Lark.EventDispatcher({
    encryptKey,
    verificationToken,
  });
}

/**
 * Clear all cached clients.
 * Useful for testing or when credentials change.
 */
export function clearClientCache(): void {
  clientCache.clear();
}
