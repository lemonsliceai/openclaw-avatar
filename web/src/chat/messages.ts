/**
 * Chat message types, content extraction, and manipulation.
 *
 * Extracted from `web/app.js` chat message/content functions.
 */

import { VOICE_CHAT_RUN_ID_PREFIX } from "../constants.js";
import { state } from "../state.js";
import type { ChatMessage, ChatMessageContentBlock } from "../types.js";

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

export function resolveChatContentTextParts(
  content: unknown[],
  options: { trim?: boolean } = {},
): string[] {
  const shouldTrim = options.trim !== false;
  if (!Array.isArray(content)) return [];
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as ChatMessageContentBlock;
    if (b.type === "text" || b.type === "input_text" || b.type === "output_text") {
      const text = typeof b.text === "string" ? (shouldTrim ? b.text.trim() : b.text) : "";
      if (text) parts.push(text);
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Image handling
// ---------------------------------------------------------------------------

export function buildDataUrlFromImageSource(source: Record<string, unknown>): string {
  const mediaType =
    (source.media_type as string) ??
    (source.mediaType as string) ??
    (source.mime_type as string) ??
    "image/png";
  const data =
    (source.data as string) ?? (source.base64 as string) ?? (source.content as string) ?? "";
  if (!data) return "";
  return `data:${mediaType};base64,${data}`;
}

export function resolveChatImageUrl(block: Record<string, unknown>): string {
  if (block.type === "image" && block.source && typeof block.source === "object") {
    const source = block.source as Record<string, unknown>;
    if (source.type === "base64") {
      return buildDataUrlFromImageSource(source);
    }
    if (typeof source.url === "string") return source.url;
  }
  if (block.image_url && typeof block.image_url === "object") {
    const imageUrl = block.image_url as Record<string, unknown>;
    if (typeof imageUrl.url === "string") return imageUrl.url;
  }
  if (typeof block.image_url === "string") return block.image_url;
  if (typeof block.url === "string") return block.url;
  return "";
}

// ---------------------------------------------------------------------------
// Message content extraction
// ---------------------------------------------------------------------------

export function extractChatMessageContent(message: Record<string, unknown>): {
  text: string;
  images: string[];
} {
  if (!message || typeof message !== "object") {
    return { text: "", images: [] };
  }
  const content = message.content;
  if (typeof content === "string") {
    return { text: content.trim(), images: [] };
  }
  if (!Array.isArray(content)) {
    return { text: "", images: [] };
  }
  const textParts = resolveChatContentTextParts(content);
  const images: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const imageUrl = resolveChatImageUrl(b);
    if (imageUrl) images.push(imageUrl);
  }
  return {
    text: textParts.join("\n\n"),
    images,
  };
}

export function extractStreamingChatMessageContent(message: unknown): {
  text: string;
  images: string[];
} {
  if (typeof message === "string") {
    return { text: message, images: [] };
  }
  if (!message || typeof message !== "object") {
    return { text: "", images: [] };
  }
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === "string") {
    return { text: content, images: [] };
  }
  if (!Array.isArray(content)) {
    return { text: "", images: [] };
  }
  const textParts = resolveChatContentTextParts(content, { trim: false });
  const images: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const imageUrl = resolveChatImageUrl(block as Record<string, unknown>);
    if (imageUrl) images.push(imageUrl);
  }
  return {
    text: textParts.join(""),
    images,
  };
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

export function resolveChatTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  return null;
}

export function resolveMessageTimestamp(message: Record<string, unknown>): number | null {
  if (!message || typeof message !== "object") return null;
  return (
    resolveChatTimestamp(message.timestamp) ??
    resolveChatTimestamp(message.createdAt) ??
    resolveChatTimestamp(message.created_at) ??
    null
  );
}

export function formatChatTimestamp(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// User timestamp prefix stripping
// ---------------------------------------------------------------------------

export function stripStoredUserTimestampPrefix(text: string): string {
  if (typeof text !== "string") return "";
  const match = /^\[\w{3}\s\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}\s\w+\]\s*/u.exec(text);
  if (match) return text.slice(match[0].length);
  return text;
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

export function getChatRoleClass(role: string): string {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return "other";
}

export function getChatSenderLabel(roleClass: string): string {
  if (roleClass === "user") return "You";
  if (roleClass === "assistant") return "Agent";
  return "System";
}

// ---------------------------------------------------------------------------
// Voice run detection
// ---------------------------------------------------------------------------

export function isVoiceRunId(runId: string): boolean {
  return typeof runId === "string" && runId.startsWith(VOICE_CHAT_RUN_ID_PREFIX);
}

// ---------------------------------------------------------------------------
// Usage metadata
// ---------------------------------------------------------------------------

export function extractMessageUsageMeta(
  rawMessage: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!rawMessage || typeof rawMessage !== "object") return null;
  const usage = rawMessage.usage as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  if (inputTokens === 0 && outputTokens === 0) return null;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cost: usage.cost ?? null,
    model: rawMessage.model ?? null,
  };
}

// ---------------------------------------------------------------------------
// Chat line helpers
// ---------------------------------------------------------------------------

export function appendChatLine(
  role: string,
  textOrMessage: string | { text: string; images?: string[] },
  options: {
    awaitingReply?: boolean;
    runId?: string;
    timestamp?: number | null;
    rawMessage?: Record<string, unknown>;
  } = {},
): void {
  const message: ChatMessage =
    typeof textOrMessage === "string"
      ? {
          role: role as ChatMessage["role"],
          text: textOrMessage,
          timestamp: options.timestamp ?? undefined,
        }
      : {
          role: role as ChatMessage["role"],
          text: textOrMessage.text,
          images: textOrMessage.images,
          timestamp: options.timestamp ?? undefined,
        };
  if (options.runId) message.runId = options.runId;
  if (options.rawMessage) {
    message.usage =
      (extractMessageUsageMeta(options.rawMessage) as ChatMessage["usage"]) ?? undefined;
  }
  state.chat.messages.push(message);
  if (options.awaitingReply !== undefined) {
    state.chat.awaitingReply = Boolean(options.awaitingReply);
  }
}

// ---------------------------------------------------------------------------
// Streaming assistant message helpers
// ---------------------------------------------------------------------------

export function hasStreamingAssistantMessage(): boolean {
  return state.chat.messages.some((m) => m.role === "assistant" && m.streaming);
}

export function clearStreamingAssistantMessages(): boolean {
  let changed = false;
  for (const msg of state.chat.messages) {
    if (msg.role === "assistant" && msg.streaming) {
      msg.streaming = false;
      changed = true;
    }
  }
  return changed;
}

export function findLatestStreamingAssistantMessage(runId = ""): ChatMessage | null {
  for (let i = state.chat.messages.length - 1; i >= 0; i--) {
    const msg = state.chat.messages[i];
    if (msg.role === "assistant" && msg.streaming && (!runId || msg.runId === runId)) {
      return msg;
    }
  }
  return null;
}

export function upsertStreamingAssistantMessage(
  textOrMessage: string | { text: string; images?: string[] },
  options: {
    state?: string;
    runId?: string;
    timestamp?: number | null;
    rawMessage?: Record<string, unknown>;
  } = {},
): void {
  const content =
    typeof textOrMessage === "string"
      ? { text: textOrMessage, images: [] as string[] }
      : {
          text: textOrMessage.text,
          images: textOrMessage.images ?? [],
        };
  const existing = findLatestStreamingAssistantMessage(options.runId);
  if (existing) {
    if (options.state === "delta") {
      existing.text = (existing.text || "") + content.text;
      if (content.images.length > 0) {
        existing.images = [...(existing.images ?? []), ...content.images];
      }
    } else {
      existing.text = content.text;
      existing.images = content.images;
    }
    if (options.timestamp != null) {
      existing.timestamp = options.timestamp ?? undefined;
    }
    if (options.rawMessage) {
      existing.usage =
        (extractMessageUsageMeta(options.rawMessage) as ChatMessage["usage"]) ?? undefined;
    }
  } else {
    const msg: ChatMessage = {
      role: "assistant",
      text: content.text,
      images: content.images,
      streaming: true,
      runId: options.runId,
      timestamp: options.timestamp ?? undefined,
    };
    if (options.rawMessage) {
      msg.usage =
        (extractMessageUsageMeta(options.rawMessage) as ChatMessage["usage"]) ?? undefined;
    }
    state.chat.messages.push(msg);
  }
}

export function finalizeStreamingAssistantMessage(
  textOrMessage: string | { text: string; images?: string[] },
  options: {
    runId?: string;
    awaitingReply?: boolean;
    timestamp?: number | null;
    rawMessage?: Record<string, unknown>;
  } = {},
): void {
  const existing = findLatestStreamingAssistantMessage(options.runId);
  const content =
    typeof textOrMessage === "string"
      ? { text: textOrMessage, images: [] as string[] }
      : {
          text: textOrMessage.text,
          images: textOrMessage.images ?? [],
        };
  if (existing) {
    existing.streaming = false;
    if (content.text) existing.text = content.text;
    if (content.images.length > 0) existing.images = content.images;
    if (options.timestamp != null) existing.timestamp = options.timestamp ?? undefined;
    if (options.rawMessage) {
      existing.usage =
        (extractMessageUsageMeta(options.rawMessage) as ChatMessage["usage"]) ?? undefined;
    }
  } else if (content.text || content.images.length > 0) {
    appendChatLine("assistant", content, {
      runId: options.runId,
      timestamp: options.timestamp,
      rawMessage: options.rawMessage,
    });
  }
  if (options.awaitingReply !== undefined) {
    state.chat.awaitingReply = Boolean(options.awaitingReply);
  }
}
