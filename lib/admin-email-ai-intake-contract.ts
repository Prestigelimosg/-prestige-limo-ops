export const adminEmailAiMailboxAddress = "booking@prestigelimo.sg";
export const adminEmailAiPrestigeSenderAddress = "info@prestigelimo.sg";
export const adminEmailAiGroundBookerSenderAddress =
  "transzend@groundbooker.com";
export const adminEmailAiGroundBookerRecipientAddress =
  "info@prestigelimo.sg";
export const adminEmailAiGroundBookerCanonicalCompanyAccount =
  "Transzend Groundbooker";
export const adminEmailAiAllowedSenderAddresses = [
  adminEmailAiPrestigeSenderAddress,
  adminEmailAiGroundBookerSenderAddress,
] as const;
export type AdminEmailAiAllowedSenderAddress =
  (typeof adminEmailAiAllowedSenderAddresses)[number];
export const adminEmailAiInboxFolder = "INBOX";

export const adminEmailAiClassifications = [
  "confirmed_booking",
  "enquiry",
  "amendment",
  "cancellation",
  "unrelated",
  "uncertain",
] as const;

export type AdminEmailAiClassification =
  (typeof adminEmailAiClassifications)[number];

export const adminEmailAiAppReviewClassifications = [
  "confirmed_booking",
  "amendment",
  "cancellation",
] as const satisfies readonly AdminEmailAiClassification[];

export function adminEmailAiClassificationAppearsInApp(value: unknown) {
  const classification =
    typeof value === "string" ? value.trim().toLowerCase() : "";

  return adminEmailAiAppReviewClassifications.some(
    (allowedClassification) =>
      allowedClassification === classification,
  );
}

export function adminEmailAiIntakeAppearsInApp(input: {
  classification?: unknown;
  senderAddress?: unknown;
  subject?: unknown;
}) {
  if (adminEmailAiClassificationAppearsInApp(input.classification)) {
    return true;
  }

  const classification =
    typeof input.classification === "string"
      ? input.classification.trim().toLowerCase()
      : "";
  const subject =
    typeof input.subject === "string" || typeof input.subject === "number"
      ? String(input.subject).replace(/\s+/g, " ").trim()
      : "";

  return (
    classification === "enquiry" &&
    normalizeAdminEmailAiAddress(input.senderAddress) ===
      adminEmailAiGroundBookerSenderAddress &&
    /\border from groundbooker transzend\s*\[inq#\d+\]\s*$/i.test(subject)
  );
}

export type AdminEmailAiEnvelopeInput = {
  deliveredTo: string[];
  from: string[];
  mailboxAddress: string;
  returnPath: string;
  to: string[];
};

export type AdminEmailAiEnvelopeDecision =
  | {
      allowed: true;
      reason: "exact_allowed_pair";
    }
  | {
      allowed: false;
      reason:
        | "mailbox_not_allowed"
        | "sender_not_allowed"
        | "return_path_not_allowed"
        | "recipient_not_allowed";
    };

export function normalizeAdminEmailAiAddress(value: unknown) {
  const text =
    typeof value === "string" || typeof value === "number"
      ? String(value).trim().toLowerCase()
      : "";
  const angleAddress = text.match(/<([^<>@\s]+@[^<>@\s]+)>/)?.[1];
  const bareAddress = text.match(
    /(?:^|[\s,;])([^<>\s,;@]+@[^<>\s,;@]+)(?:$|[\s,;])/,
  )?.[1];

  return (angleAddress || bareAddress || text)
    .replace(/^mailto:/, "")
    .replace(/[<>"']/g, "")
    .trim()
    .toLowerCase();
}

function normalizedAddressList(values: string[]) {
  return values
    .map((value) => normalizeAdminEmailAiAddress(value))
    .filter(Boolean);
}

export function adminEmailAiSenderAddressIsAllowed(
  value: unknown,
): value is AdminEmailAiAllowedSenderAddress {
  const normalized = normalizeAdminEmailAiAddress(value);

  return adminEmailAiAllowedSenderAddresses.some(
    (allowedAddress) => allowedAddress === normalized,
  );
}

export function adminEmailAiCanonicalCompanyAccountForSender(value: unknown) {
  return normalizeAdminEmailAiAddress(value) ===
    adminEmailAiGroundBookerSenderAddress
    ? adminEmailAiGroundBookerCanonicalCompanyAccount
    : null;
}

export function adminEmailAiRecipientIsAllowedForSender(
  senderAddress: AdminEmailAiAllowedSenderAddress,
  recipients: string[],
) {
  const normalizedRecipients = normalizedAddressList(recipients);
  const requiredRecipient =
    senderAddress === adminEmailAiGroundBookerSenderAddress
      ? adminEmailAiGroundBookerRecipientAddress
      : adminEmailAiMailboxAddress;

  return normalizedRecipients.includes(requiredRecipient);
}

export function decideAdminEmailAiEnvelope(
  input: AdminEmailAiEnvelopeInput,
): AdminEmailAiEnvelopeDecision {
  if (
    normalizeAdminEmailAiAddress(input.mailboxAddress) !==
    adminEmailAiMailboxAddress
  ) {
    return { allowed: false, reason: "mailbox_not_allowed" };
  }

  const from = normalizedAddressList(input.from);

  if (
    from.length !== 1 ||
    !adminEmailAiSenderAddressIsAllowed(from[0])
  ) {
    return { allowed: false, reason: "sender_not_allowed" };
  }

  if (
    normalizeAdminEmailAiAddress(input.returnPath) !==
    from[0]
  ) {
    return { allowed: false, reason: "return_path_not_allowed" };
  }

  const recipients = [
    ...normalizedAddressList(input.deliveredTo),
    ...normalizedAddressList(input.to),
  ];

  if (!adminEmailAiRecipientIsAllowedForSender(from[0], recipients)) {
    return { allowed: false, reason: "recipient_not_allowed" };
  }

  return { allowed: true, reason: "exact_allowed_pair" };
}
