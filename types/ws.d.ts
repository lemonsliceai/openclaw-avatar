declare module "ws" {
  export type ClientOptions = {
    headers?: Record<string, string>;
  };

  export class WebSocket {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;

    readyState: number;

    constructor(url: string, options?: ClientOptions);

    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: string | Buffer | Buffer[]) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;

    send(data: string | Buffer): void;
    close(code?: number, data?: string | Buffer): void;
    removeAllListeners(event?: string | symbol): this;
  }
}
