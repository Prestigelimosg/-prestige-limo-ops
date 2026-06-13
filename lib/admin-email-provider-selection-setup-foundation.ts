import "server-only";

export const adminEmailProviderSelectionSetupFoundationVersion =
  "admin-email-provider-selection-setup-foundation-v1";

export const adminEmailProviderSelectionOptions = [
  "resend",
  "aws_ses",
  "sendgrid",
  "mailgun",
] as const;

export type AdminEmailProviderSelectionOption =
  (typeof adminEmailProviderSelectionOptions)[number];

export type AdminEmailProviderSelectionSetupInput = {
  selectedProvider?: unknown;
};

export type AdminEmailProviderSelectionOptionStatus = {
  external_send: false;
  liveSendingEnabled: false;
  provider: AdminEmailProviderSelectionOption;
  providerConfigured: false;
  selection_status: "available_for_future_selection";
};

export type AdminEmailProviderSelectionSetupResult = {
  delivery_surface: "email_provider_selection_setup_only";
  external_send: false;
  liveSendingEnabled: false;
  missing_requirements: Array<"approval" | "env" | "provider">;
  providerConfigured: false;
  providerOptions: AdminEmailProviderSelectionOptionStatus[];
  providerSelected: boolean;
  selectedProvider: AdminEmailProviderSelectionOption | null;
  selectedProviderStatus: "disabled" | "not_selected";
  sendingEnabled: false;
  status: "setup_only";
  version: typeof adminEmailProviderSelectionSetupFoundationVersion;
};

function normalizeSelectedProvider(value: unknown): AdminEmailProviderSelectionOption | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  return adminEmailProviderSelectionOptions.includes(
    normalized as AdminEmailProviderSelectionOption,
  )
    ? (normalized as AdminEmailProviderSelectionOption)
    : null;
}

export function buildAdminEmailProviderSelectionSetup(
  input: AdminEmailProviderSelectionSetupInput = {},
): AdminEmailProviderSelectionSetupResult {
  const selectedProvider = normalizeSelectedProvider(input.selectedProvider);
  const missingRequirements: Array<"approval" | "env" | "provider"> = [
    ...(selectedProvider ? [] : ["provider" as const]),
    "env",
    "approval",
  ];

  return {
    delivery_surface: "email_provider_selection_setup_only",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: missingRequirements,
    providerConfigured: false,
    providerOptions: adminEmailProviderSelectionOptions.map((provider) => ({
      external_send: false,
      liveSendingEnabled: false,
      provider,
      providerConfigured: false,
      selection_status: "available_for_future_selection",
    })),
    providerSelected: Boolean(selectedProvider),
    selectedProvider,
    selectedProviderStatus: selectedProvider ? "disabled" : "not_selected",
    sendingEnabled: false,
    status: "setup_only",
    version: adminEmailProviderSelectionSetupFoundationVersion,
  };
}
