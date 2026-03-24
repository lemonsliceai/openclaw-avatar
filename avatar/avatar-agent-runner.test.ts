import { EventEmitter } from "node:events";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import avatarAgent, {
  GatewayWsClient,
  buildLemonSliceAspectRatioPayload,
  computeStreamingTextDelta,
} from "./avatar-agent-runner.js";
import {
  AVATAR_ASPECT_RATIO_DEFAULT,
  AVATAR_ASPECT_RATIO_LOOKUP,
  AVATAR_ASPECT_RATIOS,
} from "./avatar-aspect-ratio.js";

class MockWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];

  constructor(url: string) {
    super();
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sentMessages.push(payload);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open");
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", code, reason);
  }

  receive(frame: unknown) {
    this.emit("message", typeof frame === "string" ? frame : JSON.stringify(frame));
  }
}

function completeGatewayHandshake(socket: MockWebSocket, nonce = "nonce") {
  socket.open();
  socket.receive({
    type: "event",
    event: "connect.challenge",
    payload: { nonce },
  });
  const connectRequest = JSON.parse(socket.sentMessages[0] ?? "{}") as {
    id?: string;
    method?: string;
    params?: { auth?: { token?: string } };
  };
  expect(connectRequest.method).toBe("connect");
  socket.receive({
    type: "res",
    id: connectRequest.id,
    ok: true,
    payload: {},
  });
}

async function waitForSignalEvent(
  signalFile: string,
  eventType: string,
  timeoutMs = 2_000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const contents = await readFile(signalFile, "utf8");
      const hasEvent = contents
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .some((line) => {
          try {
            const parsed = JSON.parse(line) as { type?: string };
            return parsed.type === eventType;
          } catch {
            return false;
          }
        });
      if (hasEvent) {
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for signal event ${eventType}`);
}

describe("GatewayWsClient", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reconnects after an established gateway websocket closes", async () => {
    const client = new GatewayWsClient({
      WebSocket: MockWebSocket,
      url: "ws://127.0.0.1:1",
      token: "gateway-token",
      password: "",
      onChatEvent: vi.fn(),
    });

    const readyPromise = client.start();
    expect(MockWebSocket.instances).toHaveLength(1);

    const firstSocket = MockWebSocket.instances[0];
    completeGatewayHandshake(firstSocket, "first-nonce");

    await readyPromise;

    firstSocket.close(1006, "dropped");

    await vi.advanceTimersByTimeAsync(500);
    expect(MockWebSocket.instances).toHaveLength(2);

    const secondSocket = MockWebSocket.instances[1];
    completeGatewayHandshake(secondSocket, "second-nonce");

    client.stop();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("fails the initial connect attempt without entering a reconnect loop", async () => {
    const client = new GatewayWsClient({
      WebSocket: MockWebSocket,
      url: "ws://127.0.0.1:1",
      token: "gateway-token",
      password: "",
      onChatEvent: vi.fn(),
    });

    const readyPromise = client.start();
    expect(MockWebSocket.instances).toHaveLength(1);

    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "bad-nonce" },
    });
    const connectRequest = JSON.parse(socket.sentMessages[0] ?? "{}") as { id?: string };
    socket.receive({
      type: "res",
      id: connectRequest.id,
      ok: false,
      error: { message: "unauthorized" },
    });

    await expect(readyPromise).rejects.toThrow("unauthorized");
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    expect(client.ws).toBeNull();
    expect(socket.listenerCount("close")).toBe(0);

    await vi.runOnlyPendingTimersAsync();
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});

describe("computeStreamingTextDelta", () => {
  it("returns the newly appended suffix for cumulative gateway text", () => {
    expect(computeStreamingTextDelta("Hello there", "Hello")).toBe(" there");
  });

  it("returns the full text for the first streamed chunk", () => {
    expect(computeStreamingTextDelta("Hello there", "")).toBe("Hello there");
  });

  it("returns an empty delta when the chunk is unchanged", () => {
    expect(computeStreamingTextDelta("same", "same")).toBe("");
  });

  it("returns an empty delta when the next chunk is empty", () => {
    expect(computeStreamingTextDelta("", "prefix")).toBe("");
  });

  it("returns null when the next chunk is not a monotonic prefix extension", () => {
    expect(computeStreamingTextDelta("Hello world", "Hi")).toBeNull();
  });
});

describe("avatar aspect ratio constants", () => {
  it("keeps the runner validation whitelist aligned with the shared constants", () => {
    expect(Array.from(AVATAR_ASPECT_RATIO_LOOKUP)).toEqual([
      ...AVATAR_ASPECT_RATIOS,
    ]);
    expect(AVATAR_ASPECT_RATIO_DEFAULT).toBe("3x2");
  });

  it("maps aspect ratio into the LemonSlice request payload", () => {
    expect(buildLemonSliceAspectRatioPayload("9x16")).toEqual({
      aspect_ratio: "9x16",
    });
    expect(buildLemonSliceAspectRatioPayload("invalid")).toEqual({
      aspect_ratio: AVATAR_ASPECT_RATIO_DEFAULT,
    });
  });
});

describe("avatarAgent test mode", () => {
  const originalTestMode = process.env.OPENCLAW_AVATAR_TEST_MODE;
  const originalSignalFile = process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE;
  const originalDepsBaseRunner = process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER;
  const originalRunnerPath = process.env.OPENCLAW_AVATAR_RUNNER_PATH;
  let tmpDir = "";

  afterEach(async () => {
    if (originalTestMode === undefined) {
      delete process.env.OPENCLAW_AVATAR_TEST_MODE;
    } else {
      process.env.OPENCLAW_AVATAR_TEST_MODE = originalTestMode;
    }
    if (originalSignalFile === undefined) {
      delete process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE;
    } else {
      process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE = originalSignalFile;
    }
    if (originalDepsBaseRunner === undefined) {
      delete process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER;
    } else {
      process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER = originalDepsBaseRunner;
    }
    if (originalRunnerPath === undefined) {
      delete process.env.OPENCLAW_AVATAR_RUNNER_PATH;
    } else {
      process.env.OPENCLAW_AVATAR_RUNNER_PATH = originalRunnerPath;
    }
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDir = "";
  });

  it("writes connect-only runtime signals using the actual runner entry", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "avatar-runner-test-"));
    const signalFile = path.join(tmpDir, "signals.ndjson");
    const runnerPath = path.join(process.cwd(), "avatar", "avatar-agent-runner.js");
    process.env.OPENCLAW_AVATAR_TEST_MODE = "connect-only";
    process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE = signalFile;
    process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER = runnerPath;
    process.env.OPENCLAW_AVATAR_RUNNER_PATH = runnerPath;

    const room = new EventEmitter() as EventEmitter & {
      name: string;
      remoteParticipants: Map<string, unknown>;
    };
    room.name = "openclaw-main-testroom";
    room.remoteParticipants = new Map();

    const participant = { identity: "control-ui-test" };
    const ctx = {
      job: {
        metadata: JSON.stringify({
          sessionKey: "agent:main:main",
          imageUrl: "https://example.com/avatar.png",
          interruptReplyOnNewMessage: true,
        }),
      },
      room,
      connect: vi.fn(async () => {
        queueMicrotask(() => {
          room.emit("participant_connected", participant);
        });
      }),
      waitForParticipant: vi.fn(async () => {
        return participant;
      }),
    };

    const entryPromise = avatarAgent.entry(ctx);
    await waitForSignalEvent(signalFile, "awaiting-room-disconnect");
    room.emit("disconnected");
    await entryPromise;

    const events = (await readFile(signalFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type?: string; roomName?: string; participantIdentity?: string });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "job-entry-begin",
          roomName: "openclaw-main-testroom",
        }),
        expect.objectContaining({
          type: "ctx-connect-succeeded",
          roomName: "openclaw-main-testroom",
        }),
        expect.objectContaining({
          type: "wait-for-participant-succeeded",
          participantIdentity: "control-ui-test",
        }),
      ]),
    );
    expect(ctx.connect).toHaveBeenCalledTimes(1);
    expect(ctx.waitForParticipant).toHaveBeenCalledTimes(1);
  });

  it("skips dependency loading in connect-only test mode", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "avatar-runner-test-"));
    const signalFile = path.join(tmpDir, "signals.ndjson");
    process.env.OPENCLAW_AVATAR_TEST_MODE = "connect-only";
    process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE = signalFile;
    delete process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER;
    delete process.env.OPENCLAW_AVATAR_RUNNER_PATH;

    const room = new EventEmitter() as EventEmitter & {
      name: string;
      remoteParticipants: Map<string, unknown>;
    };
    room.name = "openclaw-main-testroom";
    room.remoteParticipants = new Map();

    const participant = { identity: "control-ui-test" };
    const ctx = {
      job: {
        metadata: JSON.stringify({
          sessionKey: "agent:main:main",
          imageUrl: "https://example.com/avatar.png",
          interruptReplyOnNewMessage: false,
        }),
      },
      room,
      connect: vi.fn(async () => {
        queueMicrotask(() => {
          room.emit("participant_connected", participant);
        });
      }),
      waitForParticipant: vi.fn(async () => participant),
    };

    const entryPromise = avatarAgent.entry(ctx);
    await waitForSignalEvent(signalFile, "awaiting-room-disconnect");
    room.emit("disconnected");

    await expect(entryPromise).resolves.toBeUndefined();
    expect(ctx.connect).toHaveBeenCalledTimes(1);
    expect(ctx.waitForParticipant).toHaveBeenCalledTimes(1);
  });

  it("ignores incomplete NDJSON lines while waiting for a signal event", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "avatar-runner-test-"));
    const signalFile = path.join(tmpDir, "signals.ndjson");
    await writeFile(signalFile, '{"type":"unrelated"}\n{"type":"awaiting-room-disconnect"', "utf8");

    const waitPromise = waitForSignalEvent(signalFile, "awaiting-room-disconnect", 1_000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await appendFile(signalFile, '\n{"type":"awaiting-room-disconnect"}\n', "utf8");

    await expect(waitPromise).resolves.toBeUndefined();
  });
});
