declare module "openclaw/plugin-sdk" {
  export type RespondFn = (
    success: boolean,
    result?: unknown,
    error?: { code: string; message: string; details?: unknown },
  ) => void;

  export type GatewayRequestHandlerOptions = {
    params: unknown;
    respond: RespondFn;
  };

  export type OpenClawConfig = {
    session?: {
      mainKey?: string;
    };
    videoChat?: {
      provider?: "lemonslice" | string;
      lemonSlice?: {
        apiKey?: unknown;
        imageUrl?: string;
      };
      livekit?: {
        url?: string;
        apiKey?: unknown;
        apiSecret?: unknown;
      };
    };
    messages?: {
      tts?: {
        elevenlabs?: {
          apiKey?: unknown;
          voiceId?: string;
          modelId?: string;
        };
      };
    };
    [key: string]: unknown;
  };

  export type OpenClawPluginServiceContext = {
    config: OpenClawConfig;
    gateway?: {
      port: number;
      auth:
        | { mode: "token"; token?: string }
        | { mode: "password"; password?: string }
        | { mode: "trusted-proxy" };
    };
  };

  export type OpenClawPluginApi = {
    runtime: {
      config: {
        loadConfig: () => OpenClawConfig;
        writeConfigFile?: (config: OpenClawConfig) => Promise<void>;
      };
      stt: {
        transcribeAudioFile: (input: {
          filePath: string;
          cfg: OpenClawConfig;
          mime?: string;
        }) => Promise<{ text?: string }>;
      };
    };
    logger: {
      info: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
      debug: (message: string) => void;
    };
    registerGatewayMethod: (
      method: string,
      handler: (options: GatewayRequestHandlerOptions) => Promise<void>,
    ) => void;
    registerService: (service: {
      id: string;
      start: (context: OpenClawPluginServiceContext) => Promise<void>;
      stop: () => Promise<void>;
    }) => void;
    registerHttpRoute: (route: unknown) => void;
    registerCli: (definition: unknown) => void;
    resolvePath: (input: string) => string;
    [key: string]: unknown;
  };

  export function hasConfiguredSecretInput(value: unknown): boolean;
  export function normalizeResolvedSecretInputString(params: {
    value: unknown;
    path: string;
  }): string;
}
