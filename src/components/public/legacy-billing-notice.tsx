import { SubscribeButton } from "@/components/public/subscribe-button";
import type { CurrentUserAccessContext } from "@/lib/auth/current-user";

function needsLegacyBillingUpdate(accessContext: CurrentUserAccessContext) {
  const subscription = accessContext.subscription as any;
  if (!subscription) return false;

  const status = String(subscription.status ?? "").toLowerCase();
  const gateway = String(subscription.gateway ?? "").toLowerCase();
  const originalGateway = String(subscription.original_gateway ?? "").toLowerCase();
  const planSlug = String(accessContext.plan?.slug ?? accessContext.effectiveSlug ?? "").toLowerCase();

  const isPaidPlan = planSlug === "premium" || planSlug === "plus";
  const isActive = status === "active" || status === "trialing";
  const isLegacy = subscription.migrated_from_pms === true || gateway === "legacy" || originalGateway.includes("pms");
  const hasGatewayLink = Boolean(
    (subscription.stripe_subscription_id && subscription.stripe_customer_id) ||
    (subscription.gateway_subscription_id && subscription.gateway_customer_id),
  );

  return isPaidPlan && isActive && isLegacy && !hasGatewayLink;
}

export function LegacyBillingNotice({ accessContext }: { accessContext: CurrentUserAccessContext }) {
  if (!needsLegacyBillingUpdate(accessContext)) return null;

  const planSlug = accessContext.effectiveSlug === "plus" ? "plus" : "premium";

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-amber-300/45 bg-[radial-gradient(circle_at_12%_10%,rgba(245,158,11,0.22),transparent_32%),linear-gradient(135deg,rgba(120,53,15,0.42),rgba(15,23,42,0.92))] p-5 shadow-[0_20px_70px_rgba(245,158,11,0.16)] md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">Atualização necessária</p>
          <h2 className="mt-2 text-2xl font-black text-white">Regularize sua assinatura</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/90 md:text-base">
            Sua conta foi migrada do sistema anterior. Para manter seu acesso aos kits Premium/Plus sem interrupções, atualize sua assinatura no novo checkout do Harmomus.
          </p>
        </div>
        <SubscribeButton
          planSlug={planSlug}
          label="Atualizar assinatura"
          className="inline-flex min-w-[220px] items-center justify-center rounded-xl bg-gradient-to-r from-amber-200 to-cyan-300 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_14px_45px_rgba(245,158,11,0.25)] transition hover:brightness-110 disabled:opacity-80"
        />
      </div>
    </section>
  );
}
