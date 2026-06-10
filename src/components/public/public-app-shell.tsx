import Link from "next/link";

import { PublicShellClient } from "@/components/public/public-shell-client";
import { getCurrentUserAccessContext, type CurrentUserAccessContext } from "@/lib/auth/current-user";
import { getAdminSettings } from "@/lib/data/admin-settings";
import { getBillingRecoveryNotice, type BillingRecoveryNotice } from "@/lib/data/billing-recovery-notices";
import { getPublishedKitSearchItems } from "@/lib/data/public-kits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function getRemovedMinistryNotice(userId?: string | null) {
  if (!userId) return null;

  try {
    const admin = createSupabaseAdminClient() as any;
    const { data } = await admin
      .from("ministry_members")
      .select("id,ministry_id,removed_at,updated_at")
      .eq("user_id", userId)
      .eq("status", "removed")
      .order("removed_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data?.id) return null;

    const { data: ministry } = data.ministry_id
      ? await admin.from("ministries").select("id,name").eq("id", data.ministry_id).maybeSingle()
      : { data: null };

    return {
      ministryName: ministry?.name || "seu ministério",
    };
  } catch (error) {
    console.error("[PublicAppShell] failed to load removed ministry notice", error);
    return null;
  }
}

const PAYMENT_ISSUE_STATUSES = new Set(["canceled", "past_due", "unpaid", "overdue", "incomplete", "incomplete_expired"]);

function formatRecoveryDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR");
}

function isBillingRecoveryEligible(context: CurrentUserAccessContext) {
  return Boolean(!context.isGuest && context.profile?.id && !context.isAdmin && !context.ministry);
}

function hasPaymentIssueStatus(context: CurrentUserAccessContext) {
  const status = String(context.subscription?.status ?? "").toLowerCase();
  return PAYMENT_ISSUE_STATUSES.has(status);
}

function hasBillingCustomer(context: CurrentUserAccessContext) {
  const subscription = context.subscription as any;
  return Boolean(subscription?.stripe_customer_id ?? subscription?.gateway_customer_id);
}

function shouldShowPaymentIssueBanner(context: CurrentUserAccessContext, notice: BillingRecoveryNotice | null) {
  if (!isBillingRecoveryEligible(context)) return false;
  if (notice) return !notice.dismissed_at;
  return hasPaymentIssueStatus(context);
}

function recoveryCtaHref(context: CurrentUserAccessContext) {
  if (hasBillingCustomer(context)) return "/assinatura?utm_source=app&utm_campaign=payment_failed_banner";
  return "/assinar?plano=premium&utm_source=app&utm_campaign=payment_failed_banner";
}

function PaymentIssueBanner({ notice, href }: { notice: BillingRecoveryNotice | null; href: string }) {
  const lastPaymentDate = formatRecoveryDate(notice?.last_payment_at);

  return (
    <div className="border-b border-amber-300/25 bg-amber-400/10 px-4 py-3 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-100">Seu pagamento não foi confirmado</p>
          <p className="mt-1 text-xs leading-5 text-amber-50/90 md:text-sm">Seu acesso Premium foi pausado temporariamente.</p>
          {lastPaymentDate ? (
            <p className="mt-1 text-xs leading-5 text-amber-50/80 md:text-sm">Último pagamento confirmado: {lastPaymentDate}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={href}
            className="inline-flex w-fit shrink-0 items-center justify-center rounded-xl border border-amber-200/40 bg-amber-200 px-4 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-100 md:text-sm"
          >
            Regularizar assinatura
          </Link>
          <a
            href="/api/billing/recovery-notice/dismiss"
            className="inline-flex w-fit shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 md:text-sm"
          >
            Continuar no plano gratuito
          </a>
        </div>
      </div>
    </div>
  );
}

function RemovedMinistryUpsellBanner({ ministryName }: { ministryName: string }) {
  return (
    <div className="border-b border-amber-300/20 bg-gradient-to-r from-amber-500/15 via-fuchsia-500/10 to-cyan-500/10 px-4 py-4 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-100">Seu acesso Premium Ministerial foi encerrado.</p>
          <p className="mt-1 text-xs leading-5 text-zinc-200 md:text-sm">
            Você não faz mais parte de <strong>{ministryName}</strong>. Sua conta Harmomus continua ativa no plano gratuito.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/assinar?plano=premium" className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 md:text-sm">
            Assinar Premium individual
          </Link>
          <Link href="/todos-os-kits" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 md:text-sm">
            Continuar Free
          </Link>
        </div>
      </div>
    </div>
  );
}

export async function PublicAppShell({ children }: { children: React.ReactNode }) {
  const [context, searchItems, settings] = await Promise.all([
    getCurrentUserAccessContext(),
    getPublishedKitSearchItems().catch((error) => {
      console.error("[PublicAppShell] failed to load search items", error);
      return [];
    }),
    getAdminSettings(),
  ]);

  const billingRecoveryNotice = isBillingRecoveryEligible(context)
    ? await getBillingRecoveryNotice(context.profile?.id)
    : null;
  const removedMinistryNotice = !context.isGuest && !context.ministry && context.effectiveSlug === "free"
    ? await getRemovedMinistryNotice(context.profile?.id)
    : null;
  const paymentIssue = shouldShowPaymentIssueBanner(context, billingRecoveryNotice);
  const paymentIssueHref = recoveryCtaHref(context);

  const logoUrl = settings.branding.logoUrl;
  const appName = settings.branding.appName || "Harmomus";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-3 md:h-24 md:gap-5 md:px-8">
          <Link
            href="/"
            prefetch
            className="flex min-w-[132px] shrink-0 items-center gap-3 text-base font-semibold tracking-wide text-white sm:min-w-[210px] md:min-w-[300px] md:text-xl lg:min-w-[340px]"
            aria-label={appName}
          >
            {logoUrl ? (
              <span className="flex h-12 w-[132px] items-center sm:h-14 sm:w-[210px] md:h-20 md:w-[300px] lg:w-[340px]">
                <img
                  src={logoUrl}
                  alt={appName}
                  className="h-full max-h-full w-full object-contain object-left"
                />
              </span>
            ) : (
              <span className="text-xl font-bold md:text-2xl">{appName}</span>
            )}
          </Link>

          <PublicShellClient context={context} searchItems={searchItems} />
        </div>
      </header>

      <div className="pt-20 md:pt-28">
        {paymentIssue ? <PaymentIssueBanner notice={billingRecoveryNotice} href={paymentIssueHref} /> : null}
        {!paymentIssue && removedMinistryNotice ? <RemovedMinistryUpsellBanner ministryName={removedMinistryNotice.ministryName} /> : null}
        {children}
      </div>
    </main>
  );
}
