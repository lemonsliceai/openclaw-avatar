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
    tools?: {
      media?: {
        audio?: Record<string, unknown>;
      };
    };
    avatar?: {
      provider?: "lemonslice" | string;
      verbose?: boolean;
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
        provider?: string;
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
      agent?: {
        resolveAgentDir?: (cfg: OpenClawConfig, agentId: string) => string;
      };
      tts?: {
        textToSpeechTelephony: (input: {
          text: string;
          cfg: OpenClawConfig;
          prefsPath?: string;
        }) => Promise<{
          success: boolean;
          audioBuffer?: Buffer | Uint8Array | ArrayBuffer;
          sampleRate?: number;
          provider?: string;
          error?: string;
        }>;
      };
      videoAvatar?: {
        synthesizeSpeech: (input: {
          text: string;
          cfg: OpenClawConfig;
          prefsPath?: string;
        }) => Promise<{
          audioBuffer?: Buffer | Uint8Array | ArrayBuffer;
          sampleRate?: number;
          provider?: string;
        }>;
        transcribeAudio: (input: {
          audioBuffer: Buffer | Uint8Array | ArrayBuffer;
          cfg: OpenClawConfig;
          mime?: string;
          agentDir?: string;
        }) => Promise<{ text?: string }>;
      };
      mediaUnderstanding?: {
        transcribeAudioFile: (input: {
          filePath: string;
          cfg: OpenClawConfig;
          mime?: string;
          agentDir?: string;
        }) => Promise<{ text?: string }>;
      };
      stt: {
        transcribeAudioFile: (input: {
          filePath: string;
          cfg: OpenClawConfig;
          mime?: string;
          agentDir?: string;
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
    registerCli: (
      definition: unknown,
      metadata?: {
        commands?: string[];
      },
    ) => void;
    resolvePath: (input: string) => string;
    [key: string]: unknown;
  };

  export function hasConfiguredSecretInput(value: unknown): boolean;
  export function normalizeResolvedSecretInputString(params: {
    value: unknown;
    path: string;
  }): string;
}

declare module "openclaw/plugin-sdk/plugin-entry" {
  export function definePluginEntry<T extends {
    id: string;
    name: string;
    description: string;
    register: (...args: any[]) => any;
  }>(entry: T): T & { configSchema: Record<string, never> };
}
