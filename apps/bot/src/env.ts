const readEnv = (name: string) => {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const optionalEnv = (name: string) => readEnv(name);

export const requireEnv = (name: string, message?: string) => {
  const value = readEnv(name);
  if (!value) {
    throw new Error(message ?? `${name} is required.`);
  }
  return value;
};

export const requireUrl = (name: string) => {
  const value = requireEnv(name);
  try {
    new URL(value);
  } catch (error) {
    throw new Error(`${name} must be a valid URL.`);
  }
  return value;
};

export const parsePositiveInt = (value: string | undefined, fallback: number, name?: string) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`${name ?? "Value"} must be a positive integer.`);
  }
  return parsed;
};

export const parseOptionalList = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? Array.from(new Set(entries)) : undefined;
};
