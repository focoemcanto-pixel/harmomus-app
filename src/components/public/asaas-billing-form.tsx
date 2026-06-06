"use client";

import { useMemo, useState } from "react";

type AsaasBillingFormProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function AsaasBillingForm({ href, className, children }: AsaasBillingFormProps) {
  const [name, setName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [phone, setPhone] = useState("");
  const documentDigits = onlyDigits(documentNumber);
  const isValid = name.trim().length >= 3 && (documentDigits.length === 11 || documentDigits.length === 14);

  const checkoutHref = useMemo(() => {
    if (!isValid || typeof window === "undefined") return "#";
    const url = new URL(href, window.location.origin);
    url.searchParams.set("name", name.trim());
    url.searchParams.set("cpfCnpj", documentDigits);
    if (phone.trim()) url.searchParams.set("phone", onlyDigits(phone));
    return url.toString();
  }, [href, name, documentDigits, phone, isValid]);

  return (
    <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Dados para cobrança</p>
      <label className="mt-4 block text-sm text-zinc-200">
        Nome completo
        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-3 text-white outline-none focus:border-cyan-300" />
      </label>
      <label className="mt-3 block text-sm text-zinc-200">
        Documento fiscal
        <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-3 text-white outline-none focus:border-cyan-300" />
      </label>
      <label className="mt-3 block text-sm text-zinc-200">
        Telefone <span className="text-zinc-500">opcional</span>
        <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-3 text-white outline-none focus:border-cyan-300" />
      </label>
      {!isValid ? <p className="mt-3 text-xs text-amber-200">Preencha nome e documento fiscal para continuar.</p> : null}
      <a href={checkoutHref} aria-disabled={!isValid} className={`${className ?? ""} ${isValid ? "" : "pointer-events-none opacity-60"}`}>{children}</a>
    </div>
  );
}
