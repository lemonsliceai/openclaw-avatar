const VALID_GATEWAY_AUTH_MODES = new Set([
  "token",
  "password",
  "trusted-proxy",
  "none",
]);

function readExplicitGatewayAuthMode(rawValue) {
  const normalized = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
  return VALID_GATEWAY_AUTH_MODES.has(normalized) ? normalized : null;
}

function trimStoredSecret(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readStoredSecret(value, options = {}) {
  if (typeof value !== "string") {
    return "";
  }
  return options.trim === false ? value : value.trim();
}

export function normalizeGatewayAuthMode(rawValue) {
  return readExplicitGatewayAuthMode(rawValue) || "token";
}

export function inferGatewayAuthModeFromSettings(settings = {}) {
  const normalizedSettings = settings && typeof settings === "object" ? settings : {};
  const explicitMode = readExplicitGatewayAuthMode(normalizedSettings.gatewayAuthMode);
  if (explicitMode) {
    return explicitMode;
  }
  if (typeof normalizedSettings.password === "string" && normalizedSettings.password.trim().length > 0) {
    return "password";
  }
  return "token";
}

export function getGatewayAuthStateFromSettings(settings = {}, legacyToken = "") {
  const normalizedSettings = settings && typeof settings === "object" ? settings : {};
  const mode = inferGatewayAuthModeFromSettings(normalizedSettings);
  const shouldTrimPasswordSecret = mode !== "password";
  const gatewayAuthSecret = readStoredSecret(normalizedSettings.gatewayAuthSecret, {
    trim: shouldTrimPasswordSecret,
  });
  const password = readStoredSecret(normalizedSettings.password, {
    trim: shouldTrimPasswordSecret,
  });
  const token = readStoredSecret(normalizedSettings.token);
  const legacy = readStoredSecret(legacyToken);
  const preferredSharedSecret = mode === "password" ? password : token;
  const secondarySharedSecret = mode === "password" ? token : password;

  if (preferredSharedSecret) {
    return { mode, secret: preferredSharedSecret };
  }
  if (gatewayAuthSecret) {
    return { mode, secret: gatewayAuthSecret };
  }
  if (secondarySharedSecret) {
    return { mode, secret: secondarySharedSecret };
  }
  return { mode, secret: legacy };
}

export function reconcileGatewayAuthStateWithServerMode(currentState = {}, rawMode) {
  const mode = normalizeGatewayAuthMode(rawMode);
  const secret = trimStoredSecret(currentState?.secret);
  return { mode, secret };
}
