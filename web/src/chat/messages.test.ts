import { describe, expect, it } from "vitest";
import {
  buildDataUrlFromImageSource,
  extractChatMessageContent,
  extractMessageUsageMeta,
  extractStreamingChatMessageContent,
  formatChatTimestamp,
  getChatRoleClass,
  getChatSenderLabel,
  isVoiceRunId,
  resolveChatContentTextParts,
  resolveChatImageUrl,
  resolveChatTimestamp,
  resolveMessageTimestamp,
  stripStoredUserTimestampPrefix,
} from "./messages.js";

// ---------------------------------------------------------------------------
// resolveChatContentTextParts
// ---------------------------------------------------------------------------

describe("resolveChatContentTextParts", () => {
  it("extracts text from text/input_text/output_text blocks", () => {
    const content = [
      { type: "text", text: "Hello" },
      { type: "input_text", text: "World" },
      { type: "output_text", text: "!" },
    ];
    expect(resolveChatContentTextParts(content)).toEqual(["Hello", "World", "!"]);
  });

  it("trims whitespace by default", () => {
    const content = [{ type: "text", text: "  padded  " }];
    expect(resolveChatContentTextParts(content)).toEqual(["padded"]);
  });

  it("preserves whitespace when trim is false", () => {
    const content = [{ type: "text", text: "  padded  " }];
    expect(resolveChatContentTextParts(content, { trim: false })).toEqual(["  padded  "]);
  });

  it("skips non-text block types", () => {
    const content = [
      { type: "image", source: {} },
      { type: "text", text: "only this" },
    ];
    expect(resolveChatContentTextParts(content)).toEqual(["only this"]);
  });

  it("skips empty text values", () => {
    const content = [
      { type: "text", text: "" },
      { type: "text", text: "  " },
      { type: "text", text: "real" },
    ];
    expect(resolveChatContentTextParts(content)).toEqual(["real"]);
  });

  it("returns empty array for non-array input", () => {
    expect(resolveChatContentTextParts("not an array" as unknown as unknown[])).toEqual([]);
  });

  it("skips null and primitive entries", () => {
    const content = [null, 42, undefined, { type: "text", text: "ok" }];
    expect(resolveChatContentTextParts(content)).toEqual(["ok"]);
  });
});

// ---------------------------------------------------------------------------
// buildDataUrlFromImageSource
// ---------------------------------------------------------------------------

describe("buildDataUrlFromImageSource", () => {
  it("builds a data URL from media_type and data", () => {
    const result = buildDataUrlFromImageSource({ media_type: "image/jpeg", data: "abc123" });
    expect(result).toBe("data:image/jpeg;base64,abc123");
  });

  it("falls back to image/png when no media type given", () => {
    const result = buildDataUrlFromImageSource({ data: "abc" });
    expect(result).toBe("data:image/png;base64,abc");
  });

  it("returns empty string when no data present", () => {
    expect(buildDataUrlFromImageSource({ media_type: "image/png" })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// resolveChatImageUrl
// ---------------------------------------------------------------------------

describe("resolveChatImageUrl", () => {
  it("resolves base64 image source", () => {
    const block = {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "abc" },
    };
    expect(resolveChatImageUrl(block)).toBe("data:image/png;base64,abc");
  });

  it("resolves URL image source", () => {
    const block = {
      type: "image",
      source: { type: "url", url: "https://example.com/img.png" },
    };
    expect(resolveChatImageUrl(block)).toBe("https://example.com/img.png");
  });

  it("resolves image_url object format", () => {
    const block = { image_url: { url: "https://example.com/img.png" } };
    expect(resolveChatImageUrl(block)).toBe("https://example.com/img.png");
  });

  it("resolves image_url string format", () => {
    const block = { image_url: "https://example.com/img.png" };
    expect(resolveChatImageUrl(block)).toBe("https://example.com/img.png");
  });

  it("returns empty string for unrecognized blocks", () => {
    expect(resolveChatImageUrl({ type: "text", text: "hello" })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractChatMessageContent / extractStreamingChatMessageContent
// ---------------------------------------------------------------------------

describe("extractChatMessageContent", () => {
  it("extracts text and images from array content", () => {
    const msg = {
      content: [
        { type: "text", text: "Hello" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
      ],
    };
    const result = extractChatMessageContent(msg);
    expect(result.text).toBe("Hello");
    expect(result.images).toEqual(["data:image/png;base64,abc"]);
  });

  it("handles string content", () => {
    const result = extractChatMessageContent({ content: "  plain text  " });
    expect(result.text).toBe("plain text");
    expect(result.images).toEqual([]);
  });

  it("returns empty for null message", () => {
    expect(extractChatMessageContent(null as unknown as Record<string, unknown>)).toEqual({
      text: "",
      images: [],
    });
  });
});

describe("extractStreamingChatMessageContent", () => {
  it("returns string messages directly", () => {
    expect(extractStreamingChatMessageContent("hello")).toEqual({ text: "hello", images: [] });
  });

  it("handles null input", () => {
    expect(extractStreamingChatMessageContent(null)).toEqual({ text: "", images: [] });
  });
});

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

describe("resolveChatTimestamp", () => {
  it("returns milliseconds for large values", () => {
    expect(resolveChatTimestamp(1700000000000)).toBe(1700000000000);
  });

  it("converts seconds to milliseconds for small values", () => {
    expect(resolveChatTimestamp(1700000000)).toBe(1700000000000);
  });

  it("returns null for non-finite numbers", () => {
    expect(resolveChatTimestamp(NaN)).toBeNull();
    expect(resolveChatTimestamp(Infinity)).toBeNull();
  });

  it("returns null for non-number types", () => {
    expect(resolveChatTimestamp("1700000000")).toBeNull();
    expect(resolveChatTimestamp(null)).toBeNull();
  });
});

describe("resolveMessageTimestamp", () => {
  it("resolves from timestamp field", () => {
    expect(resolveMessageTimestamp({ timestamp: 1700000000 })).toBe(1700000000000);
  });

  it("falls back to createdAt", () => {
    expect(resolveMessageTimestamp({ createdAt: 1700000000 })).toBe(1700000000000);
  });

  it("falls back to created_at", () => {
    expect(resolveMessageTimestamp({ created_at: 1700000000 })).toBe(1700000000000);
  });

  it("returns null when no timestamp fields", () => {
    expect(resolveMessageTimestamp({ role: "user" })).toBeNull();
  });
});

describe("formatChatTimestamp", () => {
  it("returns a formatted time string", () => {
    const result = formatChatTimestamp(1700000000000);
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// stripStoredUserTimestampPrefix
// ---------------------------------------------------------------------------

describe("stripStoredUserTimestampPrefix", () => {
  it("strips bracketed timestamp prefix", () => {
    expect(stripStoredUserTimestampPrefix("[Mon 2024-01-15 10:30 AM] Hello")).toBe("Hello");
  });

  it("returns original text when no prefix", () => {
    expect(stripStoredUserTimestampPrefix("No prefix here")).toBe("No prefix here");
  });

  it("returns empty string for non-string input", () => {
    expect(stripStoredUserTimestampPrefix(42 as unknown as string)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

describe("getChatRoleClass", () => {
  it("maps user to user", () => expect(getChatRoleClass("user")).toBe("user"));
  it("maps assistant to assistant", () => expect(getChatRoleClass("assistant")).toBe("assistant"));
  it("maps anything else to other", () => expect(getChatRoleClass("system")).toBe("other"));
});

describe("getChatSenderLabel", () => {
  it("maps user to You", () => expect(getChatSenderLabel("user")).toBe("You"));
  it("maps assistant to Agent", () => expect(getChatSenderLabel("assistant")).toBe("Agent"));
  it("maps other to System", () => expect(getChatSenderLabel("other")).toBe("System"));
});

// ---------------------------------------------------------------------------
// isVoiceRunId
// ---------------------------------------------------------------------------

describe("isVoiceRunId", () => {
  it("returns true for avatar-agent- prefix", () => {
    expect(isVoiceRunId("avatar-agent-12345")).toBe(true);
  });

  it("returns false for other prefixes", () => {
    expect(isVoiceRunId("run-12345")).toBe(false);
  });

  it("returns false for non-string", () => {
    expect(isVoiceRunId(null as unknown as string)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractMessageUsageMeta
// ---------------------------------------------------------------------------

describe("extractMessageUsageMeta", () => {
  it("extracts token counts and model", () => {
    const raw = {
      model: "gpt-4",
      usage: { input_tokens: 100, output_tokens: 50, cost: 0.01 },
    };
    const result = extractMessageUsageMeta(raw);
    expect(result).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      cost: 0.01,
      model: "gpt-4",
    });
  });

  it("returns null when both token counts are 0", () => {
    expect(extractMessageUsageMeta({ usage: { input_tokens: 0, output_tokens: 0 } })).toBeNull();
  });

  it("returns null for missing usage", () => {
    expect(extractMessageUsageMeta({ model: "gpt-4" })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractMessageUsageMeta(null as unknown as Record<string, unknown>)).toBeNull();
  });
});
