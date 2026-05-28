export type BillingStatus = "active" | "trialing" | "overdue" | "canceled" | "pending" | "expired";
export function mapStripeStatus(status: string): BillingStatus {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (["past_due","unpaid"].includes(status)) return "overdue";
  if (status === "canceled") return "canceled";
  if (["incomplete","incomplete_expired"].includes(status)) return "pending";
  return "expired";
}
