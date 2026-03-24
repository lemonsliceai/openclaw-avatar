import type { AvatarAspectRatio } from "./avatar-aspect-ratio.js";

export declare const avatarAgent: {
  entry: (ctx: unknown) => Promise<void>;
};

type GatewayFetch = (input: string | URL, init?: RequestInit) => Promise<unknown>;

export class GatewayWsClient {
  fetchImpl?: GatewayFetch;
  url: string;
  onChatEvent?: (event: unknown) => void;
  constructor(params: {
    fetchImpl?: GatewayFetch;
    url: string;
    onChatEvent?: (event: unknown) => void;
  });
  start(): Promise<unknown>;
  stop(): void;
}

export function computeStreamingTextDelta(
  nextText: string,
  previousText?: string,
): string | null;

export function buildLemonSliceAspectRatioPayload(aspectRatio?: string): {
  aspect_ratio: AvatarAspectRatio;
};

export function requestGatewaySpeechSynthesis(
  text: string,
  signal?: AbortSignal,
): Promise<
  | {
      audioBuffer: Buffer;
      sampleRate: number;
      provider: string;
    }
  | null
>;

export default avatarAgent;
