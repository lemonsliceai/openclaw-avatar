import type { AvatarAspectRatio } from "./avatar-aspect-ratio.js";

export declare const avatarAgent: {
  entry: (ctx: unknown) => Promise<void>;
};

export class GatewayWsClient {
  ws: unknown;
  constructor(params: {
    WebSocket: new (url: string) => unknown;
    url: string;
    token?: string;
    password?: string;
    onChatEvent?: (event: unknown) => void;
  });
  start(): Promise<unknown>;
  stop(): void;
  request(method: string, params: unknown): Promise<unknown>;
}

export function computeStreamingTextDelta(nextText: string, previousText?: string): string | null;

export function buildLemonSliceAspectRatioPayload(aspectRatio?: string): {
  aspect_ratio: AvatarAspectRatio;
};

export default avatarAgent;
