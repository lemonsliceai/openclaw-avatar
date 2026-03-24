import { describe, expect, it } from "vitest";

import {
  getGatewayAuthStateFromSettings,
  inferGatewayAuthModeFromSettings,
  reconcileGatewayAuthStateWithServerMode,
  normalizeGatewayAuthMode,
} from "../avatar/gateway-auth.js";

describe("normalizeGatewayAuthMode", () => {
  it("defaults unknown values to token", () => {
    expect(normalizeGatewayAuthMode(undefined)).toBe("token");
    expect(normalizeGatewayAuthMode("custom")).toBe("token");
  });

  it("preserves supported auth modes", () => {
    expect(normalizeGatewayAuthMode("password")).toBe("password");
    expect(normalizeGatewayAuthMode("trusted-proxy")).toBe("trusted-proxy");
    expect(normalizeGatewayAuthMode("none")).toBe("none");
  });
});

describe("inferGatewayAuthModeFromSettings", () => {
  it("infers password mode from legacy compatibility storage", () => {
    expect(inferGatewayAuthModeFromSettings({ password: "shared-secret" })).toBe("password");
  });

  it("prefers an explicit stored mode over legacy compatibility keys", () => {
    expect(
      inferGatewayAuthModeFromSettings({
        gatewayAuthMode: "token",
        password: "old-password",
      }),
    ).toBe("token");
  });
});

describe("getGatewayAuthStateFromSettings", () => {
  it("migrates legacy password credentials without clobbering them", () => {
    expect(
      getGatewayAuthStateFromSettings({
        password: "  shared-secret  ",
      }),
    ).toEqual({
      mode: "password",
      secret: "shared-secret",
    });
  });

  it("falls back to the legacy password when the new secret field is blank", () => {
    expect(
      getGatewayAuthStateFromSettings({
        gatewayAuthMode: "password",
        gatewayAuthSecret: "",
        password: "shared-secret",
      }),
    ).toEqual({
      mode: "password",
      secret: "shared-secret",
    });
  });

  it("continues to use the legacy token store when nothing newer is present", () => {
    expect(getGatewayAuthStateFromSettings({}, " legacy-token ")).toEqual({
      mode: "token",
      secret: "legacy-token",
    });
  });
});

describe("reconcileGatewayAuthStateWithServerMode", () => {
  it("preserves the current secret when the server changes auth modes", () => {
    expect(
      reconcileGatewayAuthStateWithServerMode(
        {
          mode: "token",
          secret: " shared-secret ",
        },
        "password",
      ),
    ).toEqual({
      mode: "password",
      secret: "shared-secret",
    });
  });

  it("keeps an existing secret even when the server no longer requires one", () => {
    expect(
      reconcileGatewayAuthStateWithServerMode(
        {
          mode: "password",
          secret: "shared-secret",
        },
        "none",
      ),
    ).toEqual({
      mode: "none",
      secret: "shared-secret",
    });
  });
});
