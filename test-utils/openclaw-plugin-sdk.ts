function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function hasConfiguredSecretInput(value: unknown): boolean {
  if (normalizeString(value)) {
    return true;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    if (normalizeString(candidate.value)) {
      return true;
    }
    if (normalizeString(candidate.env)) {
      return true;
    }
  }
  return false;
}

export function normalizeResolvedSecretInputString(params: { value: unknown; path: string }): string {
  const direct = normalizeString(params.value);
  if (direct) {
    return direct;
  }
  if (params.value && typeof params.value === "object" && !Array.isArray(params.value)) {
    const candidate = params.value as Record<string, unknown>;
    const nested = normalizeString(candidate.value);
    if (nested) {
      return nested;
    }
  }
  throw new Error(`missing required config: ${params.path}`);
}
