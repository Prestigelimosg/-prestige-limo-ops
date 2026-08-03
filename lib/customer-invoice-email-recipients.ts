export const customerInvoiceEmailRecipientLimit = 3;

export function selectedCustomerInvoiceRecipients(
  input: { recipientEmail?: unknown; recipientEmails?: unknown },
  sanitize: (value: unknown) => string | null,
) {
  const requested = Array.isArray(input.recipientEmails)
    ? input.recipientEmails
    : [input.recipientEmail];

  if (requested.length < 1 || requested.length > customerInvoiceEmailRecipientLimit) {
    return null;
  }

  const recipients: string[] = [];

  for (const value of requested) {
    const recipient = sanitize(value);

    if (!recipient) {
      return null;
    }

    if (!recipients.includes(recipient)) {
      recipients.push(recipient);
    }
  }

  return recipients.length > 0 ? recipients : null;
}

export function customerInvoiceRecipientsAllowed(recipients: string[], allowlist: string[]) {
  return allowlist.length === 0 || recipients.every((recipient) => allowlist.includes(recipient));
}
