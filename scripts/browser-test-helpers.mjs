export function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

export function waitForChildExit(childProcess, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(undefined);
    }, timeoutMs);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
  });
}

export function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeConsoleMessages(values) {
  return values.map(String).join(" ");
}

export async function waitForCondition(
  check,
  timeoutMs = 10000,
  description = "browser condition",
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();

    if (value) {
      return value;
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${description}`);
}
