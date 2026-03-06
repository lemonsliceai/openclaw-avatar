import type { ChildProcess } from "node:child_process";

async function delayMs(timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    timer.unref();
  });
}

export async function stopChildProcess(params: {
  child: ChildProcess | null;
  processGroupId?: number | null;
  termTimeoutMs?: number;
  postGroupKillDelayMs?: number;
}): Promise<void> {
  const child = params.child;
  const termTimeoutMs = params.termTimeoutMs ?? 2_000;
  const postGroupKillDelayMs = params.postGroupKillDelayMs ?? 200;
  const childPid = typeof child?.pid === "number" ? child.pid : 0;
  const processGroupId = typeof params.processGroupId === "number" ? params.processGroupId : 0;
  const signalPid = processGroupId > 0 ? processGroupId : childPid;
  if (signalPid <= 0 && (!child || child.exitCode !== null || child.signalCode !== null)) {
    return;
  }

  const canSignalProcessGroup = process.platform !== "win32" && signalPid > 0;
  const sendSignal = (signal: NodeJS.Signals): void => {
    if (canSignalProcessGroup) {
      try {
        // When spawned detached, -PID targets the entire process group
        // (bridge + LiveKit worker descendants).
        process.kill(-signalPid, signal);
        return;
      } catch {
        // Fall back to direct child signaling below.
      }
    }
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    try {
      child.kill(signal);
    } catch {
      // Child may already be gone.
    }
  };

  sendSignal("SIGTERM");
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    await delayMs(postGroupKillDelayMs);
    sendSignal("SIGKILL");
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        sendSignal("SIGKILL");
      }
    }, termTimeoutMs);
    timer.unref();
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function resetProcessGroupChildren(params: {
  processGroupId?: number | null;
  settleMs?: number;
}): Promise<void> {
  const processGroupId = typeof params.processGroupId === "number" ? params.processGroupId : 0;
  if (process.platform === "win32" || processGroupId <= 0) {
    return;
  }
  try {
    // Bridge handles SIGUSR2, while child job processes terminate by default.
    process.kill(-processGroupId, "SIGUSR2");
    await delayMs(params.settleMs ?? 300);
  } catch {
    // Best effort cleanup; caller can retry later.
  }
}
