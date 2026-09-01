type VerifiedCustomerAccountTitleInput = {
  bookerName?: string | null;
  companyName?: string | null;
};

function compactTitleText(value: string | null | undefined, maxLength = 120) {
  const cleaned = value?.replace(/\s+/g, " ").trim();

  return cleaned ? cleaned.slice(0, maxLength) : "";
}

export function formatVerifiedCustomerAccountTitle({
  bookerName,
  companyName,
}: VerifiedCustomerAccountTitleInput) {
  const company = compactTitleText(companyName);
  const booker = compactTitleText(bookerName, 80);

  if (company && booker) {
    return `${company} (${booker})`;
  }

  return "Customer account · Requires editing";
}
