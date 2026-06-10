export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "pending"
  | "expired"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "failed";

export function mapStripeStatus(status: string): BillingStatus {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "unpaid") return "unpaid";
  if (status === "canceled") return "canceled";
  if (status === "incomplete") return "incomplete";
  if (status === "incomplete_expired") return "incomplete_expired";
  if (status === "paused") return "paused";
  return "expired";
}
