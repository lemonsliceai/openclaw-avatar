import { describe, expect, it } from "vitest";
import { escapeChatHtml, escapeChatHtmlAttribute, normalizeChatImageSrc } from "./renderer.js";

// ---------------------------------------------------------------------------
// escapeChatHtml
// ---------------------------------------------------------------------------

describe("escapeChatHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeChatHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeChatHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("returns unchanged text with no special chars", () => {
    expect(escapeChatHtml("Hello World")).toBe("Hello World");
  });

  it("handles empty string", () => {
    expect(escapeChatHtml("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// escapeChatHtmlAttribute
// ---------------------------------------------------------------------------

describe("escapeChatHtmlAttribute", () => {
  it("escapes double quotes in addition to HTML entities", () => {
    expect(escapeChatHtmlAttribute('value="test"')).toBe("value=&quot;test&quot;");
  });

  it("escapes all HTML special chars plus quotes", () => {
    expect(escapeChatHtmlAttribute('<a href="x">')).toBe("&lt;a href=&quot;x&quot;&gt;");
  });
});

// ---------------------------------------------------------------------------
// normalizeChatImageSrc
// ---------------------------------------------------------------------------

describe("normalizeChatImageSrc", () => {
  it("allows https URLs", () => {
    expect(normalizeChatImageSrc("https://example.com/img.png")).toBe(
      "https://example.com/img.png",
    );
  });

  it("allows http URLs", () => {
    expect(normalizeChatImageSrc("http://example.com/img.png")).toBe("http://example.com/img.png");
  });

  it("allows data:image URLs", () => {
    expect(normalizeChatImageSrc("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("allows blob: URLs", () => {
    expect(normalizeChatImageSrc("blob:https://example.com/uuid")).toBe(
      "blob:https://example.com/uuid",
    );
  });

  it("allows absolute paths", () => {
    expect(normalizeChatImageSrc("/assets/img.png")).toBe("/assets/img.png");
  });

  it("rejects relative paths", () => {
    expect(normalizeChatImageSrc("../img.png")).toBe("");
  });

  it("rejects javascript: URIs", () => {
    expect(normalizeChatImageSrc("javascript:alert(1)")).toBe("");
  });

  it("returns empty for non-string input", () => {
    expect(normalizeChatImageSrc(42 as unknown as string)).toBe("");
  });

  it("returns empty for empty string", () => {
    expect(normalizeChatImageSrc("")).toBe("");
  });

  it("trims whitespace", () => {
    expect(normalizeChatImageSrc("  https://example.com/img.png  ")).toBe(
      "https://example.com/img.png",
    );
  });
});
