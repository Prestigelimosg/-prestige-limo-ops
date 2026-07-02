import "server-only";

import {
  buildAdminTelegramInternalAdminAlertSetup,
  type AdminTelegramInternalAdminAlertEventType,
} from "./admin-telegram-internal-admin-alert-setup-foundation";

export const adminTelegramInternalAdminAlertLiveSendVersion =
  "admin-telegram-internal-admin-alert-live-send-v1";

export const adminTelegramInternalAdminAlertLiveSendEnvGateName =
  "PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED";
export const adminTelegramInternalAdminAlertBotTokenEnvName =
  "PRESTIGE_TELEGRAM_BOT_TOKEN";
export const adminTelegramInternalAdminAlertDefaultChatEnvName =
  "PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID";
export const adminTelegramInternalAdminAlertChatAllowlistEnvName =
  "PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST";

export type AdminTelegramInternalAdminAlertLiveSendInput = {
  action_source?: unknown;
  booking_reference?: unknown;
  confirm_send?: unknown;
  event_type?: unknown;
  safe_message?: unknown;
  safe_title?: unknown;
};

export type AdminTelegramInternalAdminAlertLiveSendReason =
  | "chat_not_allowlisted"
  | "env_gate_closed"
  | "invalid_alert"
  | "missing_confirmation"
  | "provider_failure"
  | "provider_not_configured"
  | "provider_timeout"
  | "sent";

export type AdminTelegramInternalAdminAlertLiveSendResult = {
  action_source: string | null;
  booking_reference: string | null;
  channel: "telegram_internal_admin";
  delivery_surface: "telegram_internal_admin_alert_live_send";
  env_gate_name: typeof adminTelegramInternalAdminAlertLiveSendEnvGateName;
  event_type: AdminTelegramInternalAdminAlertEventType | null;
  external_send: boolean;
  http_status: 200 | 400 | 403 | 502 | 503 | 504;
  liveSendingEnabled: boolean;
  no_op: boolean;
  ok: boolean;
  providerConfigured: boolean;
  provider_message_id_present: boolean;
  reason: AdminTelegramInternalAdminAlertLiveSendReason;
  redacted_chat_configured: boolean;
  sendingEnabled: boolean;
  status: "blocked" | "failed" | "rejected" | "sent";
  version: typeof adminTelegramInternalAdminAlertLiveSendVersion;
};

type TelegramProviderConfig = {
  chatId: string;
  token: string;
};

type TelegramProviderConfigResult =
  | {
      data: TelegramProviderConfig;
      ok: true;
    }
  | {
      ok: false;
      reason: Extract<
        AdminTelegramInternalAdminAlertLiveSendReason,
        "chat_not_allowlisted" | "env_gate_closed" | "provider_not_configured"
      >;
      status: 403 | 503;
    };

type TelegramFetch = typeof fetch;

const telegramSendMessageApiBaseUrl = "https://api.telegram.org";
const liveSendConfirmation = "approved_internal_admin_test";
const maxTelegramTextLength = 1000;
const telegramProviderTimeoutMs = 8000;
const safeProviderFailureStatus = 502;
const safeProviderTimeoutStatus = 504;
const botTokenPattern = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
const chatIdPattern = /^-?\d{5,20}$/;

function cleanConfigValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed || null;
}

function validBotToken(value: string | null): value is string {
  return !!value && botTokenPattern.test(value);
}

function safeChatId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).trim();

  return chatIdPattern.test(cleaned) ? cleaned : null;
}

function parseChatAllowlist(value: string | null) {
  if (!value) {
    return new Set<string>();
  }

  return new Set(
    value
      .split(/[\s,]+/)
      .map((entry) => safeChatId(entry))
      .filter((entry): entry is string => Boolean(entry)),
  );
}

function resolveTelegramProviderConfig(): TelegramProviderConfigResult {
  if (process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED !== "true") {
    return {
      ok: false,
      reason: "env_gate_closed",
      status: 503,
    };
  }

  const token = cleanConfigValue(process.env.PRESTIGE_TELEGRAM_BOT_TOKEN);
  const chatId = safeChatId(
    cleanConfigValue(process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID),
  );
  const allowlist = parseChatAllowlist(
    cleanConfigValue(process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST),
  );

  if (!validBotToken(token) || !chatId || allowlist.size === 0) {
    return {
      ok: false,
      reason: "provider_not_configured",
      status: 503,
    };
  }

  if (!allowlist.has(chatId)) {
    return {
      ok: false,
      reason: "chat_not_allowlisted",
      status: 403,
    };
  }

  return {
    data: {
      chatId,
      token,
    },
    ok: true,
  };
}

function baseResult(
  input: {
    actionSource: string | null;
    bookingReference: string | null;
    eventType: AdminTelegramInternalAdminAlertEventType | null;
  },
  overrides: Partial<AdminTelegramInternalAdminAlertLiveSendResult>,
): AdminTelegramInternalAdminAlertLiveSendResult {
  return {
    action_source: input.actionSource,
    booking_reference: input.bookingReference,
    channel: "telegram_internal_admin",
    delivery_surface: "telegram_internal_admin_alert_live_send",
    env_gate_name: adminTelegramInternalAdminAlertLiveSendEnvGateName,
    event_type: input.eventType,
    external_send: false,
    http_status: 503,
    liveSendingEnabled: false,
    no_op: true,
    ok: false,
    providerConfigured: false,
    provider_message_id_present: false,
    reason: "env_gate_closed",
    redacted_chat_configured: false,
    sendingEnabled: false,
    status: "blocked",
    version: adminTelegramInternalAdminAlertLiveSendVersion,
    ...overrides,
  };
}

function messageTextFromAlert(input: {
  bookingReference: string | null;
  eventType: AdminTelegramInternalAdminAlertEventType | null;
  safeMessage: string | null;
  safeTitle: string | null;
}) {
  const lines = [
    "Prestige Limo Ops",
    input.safeTitle,
    input.safeMessage,
    input.bookingReference ? `Ref: ${input.bookingReference}` : null,
    input.eventType ? `Type: ${input.eventType}` : null,
  ].filter((line): line is string => Boolean(line));
  const text = lines.join("\n").slice(0, maxTelegramTextLength).trim();

  return text || null;
}

async function telegramMessageIdPresent(response: Response) {
  try {
    const payload = await response.json();

    return payload?.ok === true && Number.isInteger(payload?.result?.message_id);
  } catch {
    return false;
  }
}

export async function executeAdminTelegramInternalAdminAlertLiveSend(
  input: AdminTelegramInternalAdminAlertLiveSendInput,
  { fetcher = fetch }: { fetcher?: TelegramFetch } = {},
): Promise<AdminTelegramInternalAdminAlertLiveSendResult> {
  const alert = buildAdminTelegramInternalAdminAlertSetup({
    action_source: input.action_source,
    booking_reference: input.booking_reference,
    event_type: input.event_type,
    safe_message: input.safe_message,
    safe_title: input.safe_title,
  });
  const resultBase = {
    actionSource: alert.action_source,
    bookingReference: alert.booking_reference,
    eventType: alert.event_type,
  };
  const safeTitle = alert.disabled_adapter.preview.safe_title;
  const safeMessage = alert.disabled_adapter.preview.safe_message;
  const messageText = messageTextFromAlert({
    bookingReference: alert.booking_reference,
    eventType: alert.event_type,
    safeMessage,
    safeTitle,
  });

  if (input.confirm_send !== liveSendConfirmation) {
    return baseResult(resultBase, {
      http_status: 400,
      reason: "missing_confirmation",
      status: "rejected",
    });
  }

  if (alert.missing_requirements.length > 0 || !messageText) {
    return baseResult(resultBase, {
      http_status: 400,
      reason: "invalid_alert",
      status: "rejected",
    });
  }

  const config = resolveTelegramProviderConfig();

  if (!config.ok) {
    return baseResult(resultBase, {
      http_status: config.status,
      reason: config.reason,
      status: config.reason === "chat_not_allowlisted" ? "rejected" : "blocked",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), telegramProviderTimeoutMs);

  try {
    const response = await fetcher(
      `${telegramSendMessageApiBaseUrl}/bot${config.data.token}/sendMessage`,
      {
        body: JSON.stringify({
          chat_id: config.data.chatId,
          link_preview_options: {
            is_disabled: true,
          },
          protect_content: true,
          text: messageText,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return baseResult(resultBase, {
        http_status: safeProviderFailureStatus,
        liveSendingEnabled: true,
        no_op: false,
        providerConfigured: true,
        reason: "provider_failure",
        redacted_chat_configured: true,
        sendingEnabled: true,
        status: "failed",
      });
    }

    const messageIdPresent = await telegramMessageIdPresent(response);

    if (!messageIdPresent) {
      return baseResult(resultBase, {
        http_status: safeProviderFailureStatus,
        liveSendingEnabled: true,
        no_op: false,
        providerConfigured: true,
        reason: "provider_failure",
        redacted_chat_configured: true,
        sendingEnabled: true,
        status: "failed",
      });
    }

    return baseResult(resultBase, {
      external_send: true,
      http_status: 200,
      liveSendingEnabled: true,
      no_op: false,
      ok: true,
      providerConfigured: true,
      provider_message_id_present: true,
      reason: "sent",
      redacted_chat_configured: true,
      sendingEnabled: true,
      status: "sent",
    });
  } catch {
    return baseResult(resultBase, {
      http_status: safeProviderTimeoutStatus,
      liveSendingEnabled: true,
      no_op: false,
      providerConfigured: true,
      reason: "provider_timeout",
      redacted_chat_configured: true,
      sendingEnabled: true,
      status: "failed",
    });
  } finally {
    clearTimeout(timeout);
  }
}
