declare const videoChatAgent: {
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

export function computeStreamingTextDelta(
  nextText: string,
  previousText?: string,
): string | null;

export default videoChatAgent;
