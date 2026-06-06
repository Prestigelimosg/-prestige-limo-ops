export function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

export function waitForChildExit(childProcess, timeoutMs = 5000) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return Promise.resolve();
  }

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

export async function terminateChildProcess(childProcess, timeoutMs = 2000) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  childProcess.kill("SIGTERM");
  await waitForChildExit(childProcess, timeoutMs);

  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  childProcess.kill("SIGKILL");
  await waitForChildExit(childProcess, timeoutMs);
}

export function createBrowserTestReporter(testName) {
  const startedAt = Date.now();
  const progress = [];
  const verbose = /^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_TEST_VERBOSE || "");

  const seconds = (durationMs) => Number((durationMs / 1000).toFixed(1));
  const elapsedSeconds = () => seconds(Date.now() - startedAt);

  function step(label) {
    const elapsed = elapsedSeconds();
    progress.push({ elapsedSeconds: elapsed, label });
    console.log(`[${testName}] ${elapsed.toFixed(1)}s ${label}`);
  }

  function summary(details = {}) {
    return {
      ...details,
      durationSeconds: elapsedSeconds(),
      progress,
      test: testName,
    };
  }

  return {
    step,
    summary,
    verbose,
  };
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

export async function waitForBodyText(evaluate, text, description) {
  return waitForCondition(
    () => evaluate(`(document.body?.innerText || "").includes(${JSON.stringify(text)})`),
    10000,
    description,
  );
}

export async function waitForSelector(evaluate, selector, description) {
  return waitForCondition(
    () => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
    10000,
    description,
  );
}

export async function waitForTabLabels(evaluate, labels, description) {
  return waitForCondition(
    () =>
      evaluate(`(() => {
        const expectedLabels = ${JSON.stringify(labels)};
        const visibleLabels = [...document.querySelectorAll("button[role='tab']")].map(
          (button) => button.textContent.trim(),
        );

        return expectedLabels.every((label) => visibleLabels.includes(label));
      })()`),
    10000,
    description,
  );
}

export function createChromeClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const eventListeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));

    if (typeof message.id === "number") {
      const pendingRequest = pending.get(message.id);

      if (!pendingRequest) {
        return;
      }

      pending.delete(message.id);

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message));
        return;
      }

      pendingRequest.resolve(message.result);
      return;
    }

    const listeners = eventListeners.get(message.method) ?? [];
    for (const listener of listeners) {
      listener(message.params ?? {});
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function on(method, listener) {
    const listeners = eventListeners.get(method) ?? [];
    listeners.push(listener);
    eventListeners.set(method, listeners);
  }

  function once(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const listener = (params) => {
        clearTimeout(timeout);
        const listeners = eventListeners.get(method) ?? [];
        eventListeners.set(
          method,
          listeners.filter((candidate) => candidate !== listener),
        );
        resolve(params);
      };

      on(method, listener);
    });
  }

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(undefined), { once: true });
    socket.addEventListener(
      "error",
      (event) => {
        reject(event.error || new Error("Chrome DevTools WebSocket connection failed"));
      },
      { once: true },
    );
  });

  async function close() {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
      await sleep(100);
    }
  }

  return {
    close,
    on,
    once,
    ready,
    send,
  };
}

export async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function waitForChromeDebugPort(port, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }

  throw new Error(
    `Chrome remote debugging did not become ready: ${normalizeErrorMessage(lastError)}`,
  );
}

export async function waitForChromePageTarget(port, timeoutMs = 10000) {
  return waitForCondition(
    async () => {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);

      return (
        targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) ||
        false
      );
    },
    timeoutMs,
    `Chrome page target on port ${port}`,
  );
}

export async function navigateWithLoadEvent(client, url) {
  const loadEvent = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loadEvent;
}

export async function navigateAndWaitForBodyText(client, evaluate, url, text, description) {
  await navigateWithLoadEvent(client, url);
  await waitForBodyText(evaluate, text, description);
}
