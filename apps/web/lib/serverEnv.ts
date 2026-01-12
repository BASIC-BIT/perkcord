import "server-only";

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
    throw new Error(message ?? `${name} is not configured.`);
  }
  return value;
};

export const resolveEnvError = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};
