// Explicit driver-facing text only. Never interpret an untagged legacy note.
const prefix = "prestige_driver_remark_v1:";
export function normalizeDriverRemark(value: unknown): string | null {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > 500 || /[<>]|(?:https?:\/\/)|\$|\b(?:SGD|paynow|payout|invoice|billing|customer price|internal (?:admin |finance )?notes?|parser|debug|service_role)\b/i.test(text)) return null;
  return text;
}
export function encodeDriverRemark(value: unknown): string | null {
  const text = normalizeDriverRemark(value);
  if (text === null) throw new Error("Remark must contain only driver instructions, up to 500 characters.");
  return text ? prefix + text : null;
}
export function decodeDriverRemark(value: unknown): string {
  return typeof value === "string" && value.startsWith(prefix)
    ? normalizeDriverRemark(value.slice(prefix.length)) || "" : "";
}
