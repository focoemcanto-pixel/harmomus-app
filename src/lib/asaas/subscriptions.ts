import { asaasFetch } from "@/lib/asaas/client";

export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD";

export type AsaasSubscription = {
  object?: "subscription";
  id: string;
  customer: string;
  paymentLink?: string | null;
  value: number;
  nextDueDate?: string;
  cycle?: string;
  description?: string;
  billingType?: AsaasBillingType;
  status?: string;
  externalReference?: string | null;
  deleted?: boolean;
};

export type AsaasPayment = {
  object?: "payment";
  id: string;
  customer?: string;
  subscription?: string;
  billingType?: AsaasBillingType;
  status?: string;
  value?: number;
  netValue?: number;
  dueDate?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
  nossoNumero?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
};

type AsaasPaymentList = {
  object?: "list";
  data?: AsaasPayment[];
};

export async function createSubscription(input: {
  customerId: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string;
  description: string;
  externalReference?: string | null;
}) {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: {
      customer: input.customerId,
      billingType: input.billingType,
      value: input.value,
      nextDueDate: input.nextDueDate,
      cycle: "MONTHLY",
      description: input.description,
      externalReference: input.externalReference ?? undefined,
    },
  });
}

export async function getSubscription(subscriptionId: string) {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" });
}

export async function cancelSubscription(subscriptionId: string) {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
}

export async function listSubscriptionPayments(subscriptionId: string, limit = 12) {
  const query = new URLSearchParams({ limit: String(limit) });
  const result = await asaasFetch<AsaasPaymentList>(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments?${query.toString()}`, { method: "GET" });
  return result.data ?? [];
}
