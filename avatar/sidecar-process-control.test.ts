import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetProcessGroupChildren,
  stopChildProcess,
  stopMatchingProcesses,
} from "./sidecar-process-control.js";

const describeUnixOnly = process.platform === "win32" ? describe.skip : describe;
const ACTIVE_PARENTS = new Set<ChildProcess>();
const FIXTURE_WRAPPER_PATH = "/repo/avatar/avatar-agent-runner-wrapper.mjs";
const MATCHING_INSTANCE_ARG = "--openclaw-avatar-instance=gateway-port-4321";
const NON_MATCHING_INSTANCE_ARG = "--openclaw-avatar-instance=gateway-port-9999";

function isProcessRunning(pid: number | null | undefined): boolean {
  if (!pid || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessState(params: {
  pid: number;
  running: boolean;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? 5_000;
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (isProcessRunning(params.pid) === params.running) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
  throw new Error(
    `timed out waiting for pid ${params.pid} running=${String(params.running)} after ${timeoutMs}ms`,
  );
}

function trackParent(parent: ChildProcess): void {
  ACTIVE_PARENTS.add(parent);
  parent.once("exit", () => {
    ACTIVE_PARENTS.delete(parent);
  });
}

function spawnBridgeHarness(params?: {
  workerScript?: string;
}): {
  parent: ChildProcess;
  waitForNextChildPid: (timeoutMs?: number) => Promise<number>;
  requestChildSpawn: () => void;
} {
  const workerScript =
    params?.workerScript?.trim() || "setInterval(() => {}, 1000);";
  const bridgeHarnessScript = `
const { spawn } = require("node:child_process");
function spawnWorker() {
  const worker = spawn(process.execPath, ["-e", workerScript], { stdio: "ignore" });
  console.log("CHILD_PID=" + worker.pid);
}
const workerScript = ${JSON.stringify(workerScript)};
spawnWorker();
process.on("SIGUSR2", () => {});
process.on("SIGUSR1", () => {
  spawnWorker();
});
setInterval(() => {}, 1000);
`;

  const parent = spawn(process.execPath, ["-e", bridgeHarnessScript], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  trackParent(parent);

  const childPidQueue: number[] = [];
  const childPidWaiters: Array<(pid: number) => void> = [];
  let bufferedStdout = "";

  parent.stdout?.on("data", (chunk: Buffer | string) => {
    bufferedStdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    while (true) {
      const newlineIndex = bufferedStdout.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }
      const line = bufferedStdout.slice(0, newlineIndex).trim();
      bufferedStdout = bufferedStdout.slice(newlineIndex + 1);
      const match = /^CHILD_PID=(\d+)$/.exec(line);
      if (!match) {
        continue;
      }
      const pid = Number.parseInt(match[1] ?? "", 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        continue;
      }
      const waiter = childPidWaiters.shift();
      if (waiter) {
        waiter(pid);
      } else {
        childPidQueue.push(pid);
      }
    }
  });

  const waitForNextChildPid = (timeoutMs = 5_000): Promise<number> => {
    if (childPidQueue.length > 0) {
      return Promise.resolve(childPidQueue.shift() as number);
    }
    return new Promise<number>((resolve, reject) => {
      const waiter = (pid: number) => {
        clearTimeout(timer);
        resolve(pid);
      };
      const timer = setTimeout(() => {
        const index = childPidWaiters.indexOf(waiter);
        if (index >= 0) {
          childPidWaiters.splice(index, 1);
        }
        reject(new Error(`timed out waiting for child pid after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref();
      childPidWaiters.push(waiter);
    });
  };

  const requestChildSpawn = () => {
    const pid = parent.pid;
    if (!pid || pid <= 0) {
      throw new Error("bridge harness parent pid is unavailable");
    }
    process.kill(pid, "SIGUSR1");
  };

  return { parent, waitForNextChildPid, requestChildSpawn };
}

async function waitForStdoutLine(params: {
  child: ChildProcess;
  match: RegExp;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = params.timeoutMs ?? 5_000;
  const stream = params.child.stdout;
  if (!stream) {
    throw new Error("child stdout is unavailable");
  }

  let buffered = "";
  return await new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      buffered += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      while (true) {
        const newlineIndex = buffered.indexOf("\n");
        if (newlineIndex < 0) {
          break;
        }
        const line = buffered.slice(0, newlineIndex).trim();
        buffered = buffered.slice(newlineIndex + 1);
        if (params.match.test(line)) {
          cleanup();
          resolve(line);
          return;
        }
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for stdout ${String(params.match)} after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref();
    stream.on("data", onData);
  });
}

afterEach(async () => {
  for (const parent of [...ACTIVE_PARENTS]) {
    await stopChildProcess({
      child: parent,
      processGroupId: parent.pid ?? null,
      termTimeoutMs: 300,
      postGroupKillDelayMs: 50,
    }).catch(() => {});
    ACTIVE_PARENTS.delete(parent);
  }
});

describeUnixOnly("sidecar process control", () => {
  it("simulates connect, disconnect, and reload cleanup with real process groups", async () => {
    const harness = spawnBridgeHarness();
    const parentPid = harness.parent.pid;
    expect(typeof parentPid).toBe("number");
    if (!parentPid) {
      throw new Error("missing parent pid");
    }

    await waitForProcessState({ pid: parentPid, running: true });
    const firstWorkerPid = await harness.waitForNextChildPid();
    await waitForProcessState({ pid: firstWorkerPid, running: true });

    await resetProcessGroupChildren({ processGroupId: parentPid, settleMs: 200 });
    await waitForProcessState({ pid: firstWorkerPid, running: false });
    expect(isProcessRunning(parentPid)).toBe(true);

    harness.requestChildSpawn();
    const secondWorkerPid = await harness.waitForNextChildPid();
    expect(secondWorkerPid).not.toBe(firstWorkerPid);
    await waitForProcessState({ pid: secondWorkerPid, running: true });

    await resetProcessGroupChildren({ processGroupId: parentPid, settleMs: 200 });
    await waitForProcessState({ pid: secondWorkerPid, running: false });
    expect(isProcessRunning(parentPid)).toBe(true);
  }, 20_000);

  it("force kills a process group when SIGTERM is ignored", async () => {
    const stubbornScript = `
console.log("READY");
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`;
    const stubbornParent = spawn(process.execPath, ["-e", stubbornScript], {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    trackParent(stubbornParent);

    const stubbornPid = stubbornParent.pid;
    expect(typeof stubbornPid).toBe("number");
    if (!stubbornPid) {
      throw new Error("missing stubborn process pid");
    }
    await waitForStdoutLine({
      child: stubbornParent,
      match: /^READY$/,
    });
    await waitForProcessState({ pid: stubbornPid, running: true });

    process.kill(-stubbornPid, "SIGTERM");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(isProcessRunning(stubbornPid)).toBe(true);

    const stopStart = Date.now();
    await stopChildProcess({
      child: stubbornParent,
      processGroupId: stubbornPid,
      termTimeoutMs: 150,
      postGroupKillDelayMs: 50,
    });

    await waitForProcessState({ pid: stubbornPid, running: false });
    expect(Date.now() - stopStart).toBeGreaterThanOrEqual(120);
  }, 10_000);

  it("stops matching stale runner processes before a new sidecar launches", async () => {
    const harness = spawnBridgeHarness();
    const stalePid = harness.parent.pid;
    expect(typeof stalePid).toBe("number");
    if (!stalePid) {
      throw new Error("missing stale pid");
    }
    const workerPid = await harness.waitForNextChildPid();
    await waitForProcessState({ pid: stalePid, running: true });
    await waitForProcessState({ pid: workerPid, running: true });

    const stoppedPids = await stopMatchingProcesses({
      scriptPaths: [FIXTURE_WRAPPER_PATH],
      commandPatterns: [
        [
          "job_proc_lazy_main.cjs",
          FIXTURE_WRAPPER_PATH,
          MATCHING_INSTANCE_ARG,
        ],
      ],
      termTimeoutMs: 100,
      postKillDelayMs: 50,
      listProcesses: async () => [
        {
          pid: stalePid,
          command:
            `node /repo/tmp/job_proc_lazy_main.cjs ${FIXTURE_WRAPPER_PATH} ${MATCHING_INSTANCE_ARG}`,
        },
      ],
    });

    expect(stoppedPids).toEqual([stalePid]);
    await waitForProcessState({ pid: stalePid, running: false });
    await waitForProcessState({ pid: workerPid, running: false });
  }, 10_000);

  it("does not match other sidecar instances by basename alone", async () => {
    const staleProcess = spawn(
      process.execPath,
      [
        "-e",
        `
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
      ],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    trackParent(staleProcess);

    const stalePid = staleProcess.pid;
    expect(typeof stalePid).toBe("number");
    if (!stalePid) {
      throw new Error("missing stale pid");
    }
    await waitForProcessState({ pid: stalePid, running: true });

    const stoppedPids = await stopMatchingProcesses({
      scriptPaths: [FIXTURE_WRAPPER_PATH],
      commandPatterns: [
        [
          "job_proc_lazy_main.cjs",
          FIXTURE_WRAPPER_PATH,
          MATCHING_INSTANCE_ARG,
        ],
      ],
      termTimeoutMs: 100,
      postKillDelayMs: 50,
      listProcesses: async () => [
        {
          pid: stalePid,
          command:
            `node /repo/tmp/job_proc_lazy_main.cjs /repo/tmp/old-plugin-copy/avatar-agent-runner-wrapper.mjs ${NON_MATCHING_INSTANCE_ARG}`,
        },
      ],
    });

    expect(stoppedPids).toEqual([]);
    await waitForProcessState({ pid: stalePid, running: true });
  }, 10_000);
});
