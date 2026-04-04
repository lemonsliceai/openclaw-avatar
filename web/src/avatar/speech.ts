/**
 * Server-side speech transcription (VAD, capture, echo suppression)
 * and browser SpeechRecognition API.
 *
 * Extracted from `web/app.js` speech-related functions (~1,200 lines).
 */

import {
  AVATAR_ECHO_ACTIVE_WINDOW_MS,
  AVATAR_ECHO_MAX_RECENT_REPLIES,
  AVATAR_ECHO_MIN_TRANSCRIPT_CHARS,
  AVATAR_ECHO_MIN_TRANSCRIPT_TOKENS,
  AVATAR_ECHO_RECENT_REPLY_RETENTION_MS,
  AVATAR_ECHO_TOKEN_OVERLAP_THRESHOLD,
  BROWSER_SPEECH_RECOGNITION,
  SERVER_SPEECH_AVATAR_COOLDOWN_MS,
  SERVER_SPEECH_CAPTURE_MIME_TYPES,
  SERVER_SPEECH_HIGH_PASS_COEFFICIENT,
  SERVER_SPEECH_NOISE_FLOOR_FALL_SMOOTHING,
  SERVER_SPEECH_NOISE_FLOOR_RISE_SMOOTHING,
  SERVER_SPEECH_SAMPLE_RATE,
  SERVER_SPEECH_START_RETRY_BASE_DELAY_MS,
  SERVER_SPEECH_START_RETRY_MAX_ATTEMPTS,
  SERVER_SPEECH_START_RETRY_MAX_DELAY_MS,
} from "../constants.js";
import { state } from "../state.js";
import type { SpeechMetrics } from "../types.js";

// ---------------------------------------------------------------------------
// Echo suppression — recent avatar replies
// ---------------------------------------------------------------------------

export function pruneRecentAvatarReplies(now = Date.now()): void {
  const replies = state.room.recentAvatarReplies;
  for (let i = replies.length - 1; i >= 0; i -= 1) {
    if (now - replies[i].at > AVATAR_ECHO_RECENT_REPLY_RETENTION_MS) {
      replies.splice(i, 1);
    }
  }
}

export function clearRecentAvatarReplies(): void {
  state.room.recentAvatarReplies.length = 0;
}

export function rememberRecentAvatarReply(text: string, timestamp = Date.now()): void {
  const tokens = extractComparableSpeechTokens(text);
  if (tokens.length === 0) return;
  state.room.recentAvatarReplies.push({ text, tokens, at: timestamp });
  if (state.room.recentAvatarReplies.length > AVATAR_ECHO_MAX_RECENT_REPLIES) {
    state.room.recentAvatarReplies.shift();
  }
  pruneRecentAvatarReplies(timestamp);
}

// ---------------------------------------------------------------------------
// Speech text normalization & comparison
// ---------------------------------------------------------------------------

export function normalizeComparableSpeechText(value: unknown): string {
  return String(value || "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function extractComparableSpeechTokens(value: unknown): string[] {
  const normalized = normalizeComparableSpeechText(value);
  if (!normalized) return [];
  return normalized.split(/\s+/u).filter((token) => [...token].length > 2);
}

export function countMatchingSpeechTokens(
  candidateTokens: string[],
  referenceTokens: string[],
): number {
  if (candidateTokens.length === 0 || referenceTokens.length === 0) return 0;
  const referenceSet = new Set(referenceTokens);
  let matches = 0;
  for (const token of candidateTokens) {
    if (referenceSet.has(token)) matches += 1;
  }
  return matches;
}

export function shouldSuppressVoiceTranscriptAsAvatarEcho(rawTranscript: string): boolean {
  const normalized = normalizeComparableSpeechText(rawTranscript);
  if (normalized.length < AVATAR_ECHO_MIN_TRANSCRIPT_CHARS) return false;
  const candidateTokens = extractComparableSpeechTokens(rawTranscript);
  if (candidateTokens.length < AVATAR_ECHO_MIN_TRANSCRIPT_TOKENS) return false;
  pruneRecentAvatarReplies();
  for (const reply of state.room.recentAvatarReplies) {
    const matches = countMatchingSpeechTokens(candidateTokens, reply.tokens);
    const overlap = matches / candidateTokens.length;
    if (overlap >= AVATAR_ECHO_TOKEN_OVERLAP_THRESHOLD) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Avatar speech timing
// ---------------------------------------------------------------------------

export function isAvatarSpeechRecent(now = Date.now()): boolean {
  return (
    state.room.avatarSpeechActive ||
    now - state.room.avatarSpeechLastDetectedAt < AVATAR_ECHO_ACTIVE_WINDOW_MS
  );
}

export function shouldBlockServerSpeechTranscription(now = Date.now()): boolean {
  return (
    state.room.avatarSpeechActive ||
    now - state.room.avatarSpeechLastDetectedAt < SERVER_SPEECH_AVATAR_COOLDOWN_MS
  );
}

// ---------------------------------------------------------------------------
// Browser speech recognition support
// ---------------------------------------------------------------------------

export function browserSpeechRecognitionSupported(): boolean {
  return BROWSER_SPEECH_RECOGNITION !== null;
}

export function serverSpeechTranscriptionSupported(): boolean {
  return typeof AudioContext !== "undefined" && typeof MediaRecorder !== "undefined";
}

export function shouldRunVoiceTranscription(): boolean {
  return Boolean(state.room.activeRoom) && state.room.connectionState === "connected";
}

export function shouldPreferBrowserSpeechRecognition(): boolean {
  return browserSpeechRecognitionSupported();
}

// ---------------------------------------------------------------------------
// VAD helpers
// ---------------------------------------------------------------------------

export function resetServerSpeechDetectorState(): void {
  state.serverSpeech.speechFrameStreak = 0;
  state.serverSpeech.voicedFrameCount = 0;
  state.serverSpeech.noiseFloor = 0;
  state.serverSpeech.vadPrevInput = 0;
  state.serverSpeech.vadPrevOutput = 0;
}

export function updateServerSpeechNoiseFloor(level: number): void {
  if (state.serverSpeech.noiseFloor <= 0) {
    state.serverSpeech.noiseFloor = level;
    return;
  }
  const smoothing =
    level > state.serverSpeech.noiseFloor
      ? SERVER_SPEECH_NOISE_FLOOR_RISE_SMOOTHING
      : SERVER_SPEECH_NOISE_FLOOR_FALL_SMOOTHING;
  state.serverSpeech.noiseFloor =
    state.serverSpeech.noiseFloor * (1 - smoothing) + level * smoothing;
}

export function measureRealtimeSpeechMetrics(samples: Float32Array): SpeechMetrics {
  let sumSquares = 0;
  let highPassLevel = 0;
  let zeroCrossings = 0;
  let prevInput = state.serverSpeech.vadPrevInput;
  let prevOutput = state.serverSpeech.vadPrevOutput;

  for (let i = 0; i < samples.length; i++) {
    const input = samples[i];
    sumSquares += input * input;

    const output = SERVER_SPEECH_HIGH_PASS_COEFFICIENT * (prevOutput + input - prevInput);
    highPassLevel += Math.abs(output);
    prevOutput = output;
    prevInput = input;

    if (i > 0 && samples[i] >= 0 !== samples[i - 1] >= 0) {
      zeroCrossings += 1;
    }
  }

  state.serverSpeech.vadPrevInput = prevInput;
  state.serverSpeech.vadPrevOutput = prevOutput;

  return {
    rms: Math.sqrt(sumSquares / samples.length),
    highPassLevel: highPassLevel / samples.length,
    zeroCrossingRate: zeroCrossings / samples.length,
  };
}

// ---------------------------------------------------------------------------
// Audio encoding helpers
// ---------------------------------------------------------------------------

export function base64EncodeBytes(bytes: Uint8Array): string {
  const chunkSize = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(chunks.join(""));
}

export function resolveServerSpeechCaptureMimeType(): string {
  for (const mimeType of SERVER_SPEECH_CAPTURE_MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "";
}

export function downsampleAudioForRealtimeTranscription(
  samples: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return samples;
  const ratio = inputRate / outputRate;
  const length = Math.floor(samples.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, samples.length - 1);
    const frac = srcIndex - low;
    result[i] = samples[low] * (1 - frac) + samples[high] * frac;
  }
  return result;
}

export function convertSamplesToPcmBytes(samples: Float32Array, inputRate: number): Uint8Array {
  const resampled = downsampleAudioForRealtimeTranscription(
    samples,
    inputRate,
    SERVER_SPEECH_SAMPLE_RATE,
  );
  const buffer = new ArrayBuffer(resampled.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export function buildWaveBytesFromPcm(
  pcmBytes: Uint8Array,
  sampleRate: number,
  numChannels = 1,
): Uint8Array {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const headerSize = 44;
  const totalSize = headerSize + pcmBytes.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, pcmBytes.length, true);
  new Uint8Array(buffer).set(pcmBytes, headerSize);

  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// Capture state management
// ---------------------------------------------------------------------------

export function resetServerSpeechCaptureState(): void {
  state.serverSpeech.speechActive = false;
  state.serverSpeech.speechStartedAt = 0;
  state.serverSpeech.silenceStartedAt = 0;
  state.serverSpeech.pcmChunks = [];
  state.serverSpeech.pcmByteLength = 0;
  state.serverSpeech.prerollChunks = [];
  state.serverSpeech.speechFrameStreak = 0;
  state.serverSpeech.voicedFrameCount = 0;
  state.serverSpeech.bargeInActive = false;
}

export function isMicrophoneMuted(): boolean {
  return state.media.preferredMicMuted;
}

export function hasUsableMic(): boolean {
  return Boolean(
    state.room.localAudioTrack ||
      (typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function"),
  );
}

// ---------------------------------------------------------------------------
// Server speech start retry
// ---------------------------------------------------------------------------

export function clearServerSpeechStartRetryTimer(options: { resetCount?: boolean } = {}): void {
  if (state.serverSpeech.startRetryTimer !== null) {
    clearTimeout(state.serverSpeech.startRetryTimer);
    state.serverSpeech.startRetryTimer = null;
  }
  if (options.resetCount !== false) {
    state.serverSpeech.startRetryCount = 0;
  }
}

export function getServerSpeechStartRetryDelay(): number {
  const attempt = state.serverSpeech.startRetryCount;
  return Math.min(
    SERVER_SPEECH_START_RETRY_BASE_DELAY_MS * 2 ** attempt,
    SERVER_SPEECH_START_RETRY_MAX_DELAY_MS,
  );
}

export function canRetryServerSpeechStart(): boolean {
  return state.serverSpeech.startRetryCount < SERVER_SPEECH_START_RETRY_MAX_ATTEMPTS;
}

// ---------------------------------------------------------------------------
// Browser speech recognition
// ---------------------------------------------------------------------------

export function clearBrowserSpeechRecognitionRestartTimer(): void {
  if (state.browserSpeech.restartTimer !== null) {
    clearTimeout(state.browserSpeech.restartTimer);
    state.browserSpeech.restartTimer = null;
  }
}

export function stopBrowserSpeechRecognition(): void {
  clearBrowserSpeechRecognitionRestartTimer();
  state.browserSpeech.shouldRun = false;
  state.browserSpeech.active = false;
  if (state.browserSpeech.recognition) {
    try {
      (state.browserSpeech.recognition as { stop?: () => void }).stop?.();
    } catch {
      // Ignore stop errors.
    }
  }
  state.browserSpeech.recognition = null;
}

// ---------------------------------------------------------------------------
// Transcript extraction
// ---------------------------------------------------------------------------

export function extractServerSpeechTranscript(payload: Record<string, unknown>): string {
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (text) return text;
  const results = payload?.results;
  if (Array.isArray(results) && results.length > 0) {
    const first = results[0] as Record<string, unknown>;
    if (typeof first?.transcript === "string") return first.transcript.trim();
  }
  return "";
}

export function stripRealtimeTranscriptionCaptionCues(value: string): string {
  return value
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .trim();
}
