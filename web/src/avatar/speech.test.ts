import { describe, expect, it } from "vitest";
import {
  base64EncodeBytes,
  countMatchingSpeechTokens,
  downsampleAudioForRealtimeTranscription,
  extractComparableSpeechTokens,
  extractServerSpeechTranscript,
  normalizeComparableSpeechText,
  stripRealtimeTranscriptionCaptionCues,
} from "./speech.js";

// ---------------------------------------------------------------------------
// normalizeComparableSpeechText
// ---------------------------------------------------------------------------

describe("normalizeComparableSpeechText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeComparableSpeechText("Hello, World!")).toBe("hello world");
  });

  it("collapses whitespace", () => {
    expect(normalizeComparableSpeechText("  too   many   spaces  ")).toBe("too many spaces");
  });

  it("handles empty/null values", () => {
    expect(normalizeComparableSpeechText("")).toBe("");
    expect(normalizeComparableSpeechText(null)).toBe("");
    expect(normalizeComparableSpeechText(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractComparableSpeechTokens
// ---------------------------------------------------------------------------

describe("extractComparableSpeechTokens", () => {
  it("splits into tokens longer than 2 characters", () => {
    expect(extractComparableSpeechTokens("The big cat is on the mat")).toEqual([
      "the",
      "big",
      "cat",
      "the",
      "mat",
    ]);
  });

  it("filters out short tokens", () => {
    // "is", "on" are 2 chars — filtered out
    const tokens = extractComparableSpeechTokens("I am ok");
    expect(tokens).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(extractComparableSpeechTokens("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// countMatchingSpeechTokens
// ---------------------------------------------------------------------------

describe("countMatchingSpeechTokens", () => {
  it("counts overlapping tokens", () => {
    const candidate = ["hello", "world", "foo"];
    const reference = ["hello", "world", "bar"];
    expect(countMatchingSpeechTokens(candidate, reference)).toBe(2);
  });

  it("returns 0 for no overlap", () => {
    expect(countMatchingSpeechTokens(["aaa"], ["bbb"])).toBe(0);
  });

  it("returns 0 for empty arrays", () => {
    expect(countMatchingSpeechTokens([], ["hello"])).toBe(0);
    expect(countMatchingSpeechTokens(["hello"], [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// base64EncodeBytes
// ---------------------------------------------------------------------------

describe("base64EncodeBytes", () => {
  it("encodes a small buffer", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(base64EncodeBytes(bytes)).toBe(btoa("Hello"));
  });

  it("encodes an empty buffer", () => {
    expect(base64EncodeBytes(new Uint8Array(0))).toBe("");
  });

  it("handles buffers larger than chunk size (8192)", () => {
    const bytes = new Uint8Array(16384);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const result = base64EncodeBytes(bytes);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Verify round-trip
    const decoded = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });
});

// ---------------------------------------------------------------------------
// downsampleAudioForRealtimeTranscription
// ---------------------------------------------------------------------------

describe("downsampleAudioForRealtimeTranscription", () => {
  it("returns original samples when rates match", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const result = downsampleAudioForRealtimeTranscription(samples, 48000, 48000);
    expect(result).toBe(samples);
  });

  it("downsamples 48000 to 16000 (3:1 ratio)", () => {
    const input = new Float32Array(48);
    for (let i = 0; i < input.length; i++) input[i] = i / input.length;
    const result = downsampleAudioForRealtimeTranscription(input, 48000, 16000);
    expect(result.length).toBe(16);
  });

  it("produces interpolated values", () => {
    const input = new Float32Array([0.0, 1.0, 0.0, 1.0]);
    const result = downsampleAudioForRealtimeTranscription(input, 4, 2);
    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(0.0);
    expect(result[1]).toBeCloseTo(0.0);
  });
});

// ---------------------------------------------------------------------------
// extractServerSpeechTranscript
// ---------------------------------------------------------------------------

describe("extractServerSpeechTranscript", () => {
  it("extracts from text field", () => {
    expect(extractServerSpeechTranscript({ text: "  hello  " })).toBe("hello");
  });

  it("falls back to results array", () => {
    expect(
      extractServerSpeechTranscript({
        results: [{ transcript: " world " }],
      }),
    ).toBe("world");
  });

  it("returns empty for missing data", () => {
    expect(extractServerSpeechTranscript({})).toBe("");
  });
});

// ---------------------------------------------------------------------------
// stripRealtimeTranscriptionCaptionCues
// ---------------------------------------------------------------------------

describe("stripRealtimeTranscriptionCaptionCues", () => {
  it("strips bracketed cues", () => {
    expect(stripRealtimeTranscriptionCaptionCues("[music] Hello")).toBe("Hello");
  });

  it("strips parenthetical cues", () => {
    expect(stripRealtimeTranscriptionCaptionCues("(laughter) Funny")).toBe("Funny");
  });

  it("strips multiple cues", () => {
    expect(stripRealtimeTranscriptionCaptionCues("[intro] (applause) Welcome")).toBe("Welcome");
  });

  it("returns empty for cue-only content", () => {
    expect(stripRealtimeTranscriptionCaptionCues("[silence]")).toBe("");
  });
});
