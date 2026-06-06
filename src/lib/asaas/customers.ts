import { asaasFetch } from "@/lib/asaas/client";

export type AsaasCustomer = {
  object?: "customer";
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  cpfCnpj?: string;
  externalReference?: string;
  deleted?: boolean;
};

type AsaasCustomerList = {
  object?: "list";
  hasMore?: boolean;
  totalCount?: number;
  limit?: number;
  offset?: number;
  data?: AsaasCustomer[];
};

export async function createCustomer(input: {
  name: string;
  email: string;
  externalReference?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  cpfCnpj?: string | null;
}) {
  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: {
      name: input.name,
      email: input.email,
      externalReference: input.externalReference ?? undefined,
      phone: input.phone ?? undefined,
      mobilePhone: input.mobilePhone ?? undefined,
      cpfCnpj: input.cpfCnpj ?? undefined,
    },
  });
}

export async function getCustomer(customerId: string) {
  return asaasFetch<AsaasCustomer>(`/customers/${encodeURIComponent(customerId)}`, { method: "GET" });
}

export async function findCustomerByEmail(email: string) {
  const query = new URLSearchParams({ email: email.trim().toLowerCase(), limit: "1" });
  const result = await asaasFetch<AsaasCustomerList>(`/customers?${query.toString()}`, { method: "GET" });
  return result.data?.[0] ?? null;
}
