/**
 * Chat composer — input management, attachments, token estimation, drafts.
 *
 * Extracted from `web/app.js` chat composer functions.
 */

import {
  CHAT_MAX_IMAGE_ATTACHMENT_BYTES,
  CHAT_SUPPORTED_IMAGE_MIME_TYPES,
  CHAT_TOKEN_ESTIMATE_MIN_CHARS,
} from "../constants.js";
import { state } from "../state.js";
import type { ChatAttachment, ChatComposerKey } from "../types.js";

// ---------------------------------------------------------------------------
// Composer key normalization
// ---------------------------------------------------------------------------

export function normalizeChatComposerKey(key: string): ChatComposerKey {
  return key === "pip" ? "pip" : "main";
}

// ---------------------------------------------------------------------------
// Attachment ID generation
// ---------------------------------------------------------------------------

export function nextChatComposerAttachmentId(): string {
  state.chat.composerAttachmentIdCounter += 1;
  return `chat-attachment-${Date.now()}-${state.chat.composerAttachmentIdCounter}`;
}

// ---------------------------------------------------------------------------
// MIME type checks
// ---------------------------------------------------------------------------

export function isSupportedChatImageMimeType(mimeType: string): boolean {
  return CHAT_SUPPORTED_IMAGE_MIME_TYPES.has(mimeType);
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as data URL."));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Image extraction from clipboard
// ---------------------------------------------------------------------------

export function extractImageFilesFromClipboardEvent(event: ClipboardEvent): File[] {
  const files: File[] = [];
  const items = event.clipboardData?.items;
  if (!items) return files;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    if (!isSupportedChatImageMimeType(item.type)) continue;
    const file = item.getAsFile();
    if (file && file.size <= CHAT_MAX_IMAGE_ATTACHMENT_BYTES) {
      files.push(file);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Draft management
// ---------------------------------------------------------------------------

export function getChatComposerDraft(key: string = "main"): { attachments: ChatAttachment[] } {
  const normalized = normalizeChatComposerKey(key);
  return state.chat.composerDrafts[normalized] ?? { attachments: [] };
}

export function clearChatComposerAttachments(key: string): void {
  const normalized = normalizeChatComposerKey(key);
  const draft = state.chat.composerDrafts[normalized];
  if (draft) {
    draft.attachments = [];
  }
}

export function clearAllChatComposerAttachments(): void {
  clearChatComposerAttachments("main");
  clearChatComposerAttachments("pip");
}

export function removeChatComposerAttachment(key: string, attachmentId: string): void {
  const normalized = normalizeChatComposerKey(key);
  const draft = state.chat.composerDrafts[normalized];
  if (!draft) return;
  draft.attachments = draft.attachments.filter((a) => a.id !== attachmentId);
}

export function hasChatComposerDraftValue(
  value: string,
  attachments: ChatAttachment[] = [],
): boolean {
  return (typeof value === "string" && value.trim().length > 0) || attachments.length > 0;
}

// ---------------------------------------------------------------------------
// Data URL parsing
// ---------------------------------------------------------------------------

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;,]+)(?:;base64)?,(.*)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

// ---------------------------------------------------------------------------
// Build send-ready attachments
// ---------------------------------------------------------------------------

export function buildChatSendAttachments(attachments: ChatAttachment[]): Array<{
  type: string;
  mimeType: string;
  fileName: string;
  content: string;
}> {
  const results: Array<{
    type: string;
    mimeType: string;
    fileName: string;
    content: string;
  }> = [];
  for (const attachment of attachments) {
    const parsed = parseDataUrl(attachment.dataUrl);
    if (!parsed) continue;
    results.push({
      type: "image",
      mimeType: parsed.mimeType,
      fileName: attachment.name,
      content: parsed.data,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

export function estimateChatTokens(value: string): number | null {
  if (typeof value !== "string" || value.length < CHAT_TOKEN_ESTIMATE_MIN_CHARS) {
    return null;
  }
  return Math.ceil(value.length / 4);
}

// ---------------------------------------------------------------------------
// Textarea auto-resize
// ---------------------------------------------------------------------------

export function syncTextareaHeight(
  textarea: HTMLTextAreaElement | null,
  options: { minHeight?: number; maxHeight?: number } = {},
): void {
  if (!textarea) return;
  const minHeight = options.minHeight ?? 40;
  const maxHeight = options.maxHeight ?? 200;
  textarea.style.height = "auto";
  const scrollHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.min(maxHeight, Math.max(minHeight, scrollHeight))}px`;
}
