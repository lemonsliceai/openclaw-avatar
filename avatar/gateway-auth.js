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

export function normalizeGatewayAuthMode(rawValue) {
  return readExplicitGatewayAuthMode(rawValue) || "token";
}

export function inferGatewayAuthModeFromSettings(settings = {}) {
  const normalizedSettings = settings && typeof settings === "object" ? settings : {};
  const explicitMode = readExplicitGatewayAuthMode(normalizedSettings.gatewayAuthMode);
  if (explicitMode) {
    return explicitMode;
  }
  if (typeof normalizedSettings.password === "string") {
    return "password";
  }
  if (typeof normalizedSettings.token === "string") {
    return "token";
  }
  return "token";
}

export function getGatewayAuthStateFromSettings(settings = {}, legacyToken = "") {
  const normalizedSettings = settings && typeof settings === "object" ? settings : {};
  const mode = inferGatewayAuthModeFromSettings(normalizedSettings);
  const gatewayAuthSecret = trimStoredSecret(normalizedSettings.gatewayAuthSecret);
  const password = trimStoredSecret(normalizedSettings.password);
  const token = trimStoredSecret(normalizedSettings.token);
  const legacy = trimStoredSecret(legacyToken);

  if (gatewayAuthSecret) {
    return { mode, secret: gatewayAuthSecret };
  }
  if (mode === "password" && password) {
    return { mode, secret: password };
  }
  if (token) {
    return { mode, secret: token };
  }
  return { mode, secret: legacy };
}

export function reconcileGatewayAuthStateWithServerMode(currentState = {}, rawMode) {
  const mode = normalizeGatewayAuthMode(rawMode);
  const secret = trimStoredSecret(currentState?.secret);
  return { mode, secret };
}
