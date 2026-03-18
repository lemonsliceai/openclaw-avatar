declare const videoChatAgent: {
  entry: (ctx: unknown) => Promise<void>;
};

export declare const VIDEO_CHAT_AVATAR_ASPECT_RATIOS: readonly ["2x3", "3x2", "9x16", "16x9"];
export declare const VIDEO_CHAT_AVATAR_ASPECT_RATIO_DEFAULT: (typeof VIDEO_CHAT_AVATAR_ASPECT_RATIOS)[number];
export declare const VIDEO_CHAT_AVATAR_ASPECT_RATIO_LOOKUP: ReadonlySet<
  (typeof VIDEO_CHAT_AVATAR_ASPECT_RATIOS)[number]
>;

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

export function computeStreamingTextDelta(
  nextText: string,
  previousText?: string,
): string | null;

export default videoChatAgent;
