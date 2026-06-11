"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AsaasBillingFormProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
  onBeforeContinue?: (href: string) => void;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpfCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length <= 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function AsaasBillingForm({ href, className, children, onBeforeContinue }: AsaasBillingFormProps) {
  const [name, setName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const documentDigits = onlyDigits(documentNumber);
  const isValid = name.trim().length >= 3 && (documentDigits.length === 11 || documentDigits.length === 14);

  useEffect(() => {
    const element = formRef.current;
    if (!element) return;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const offset = isMobile ? 36 : 96;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  const checkoutHref = useMemo(() => {
    if (!isValid || typeof window === "undefined") return "#";
    const url = new URL(href, window.location.origin);
    url.searchParams.set("name", name.trim());
    url.searchParams.set("cpfCnpj", documentDigits);
    return url.toString();
  }, [href, name, documentDigits, isValid]);

  const continueClassName = `${className ?? ""} ${isValid ? "" : "pointer-events-none opacity-60"}`;

  return (
    <div ref={formRef} className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Dados para cobrança</p>
      <label className="mt-4 block text-sm text-zinc-200">
        Nome completo
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Digite seu nome completo" className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-3 text-white outline-none focus:border-cyan-300" />
      </label>
      <label className="mt-3 block text-sm text-zinc-200">
        CPF/CNPJ
        <input value={documentNumber} onChange={(event) => setDocumentNumber(formatCpfCnpj(event.target.value))} placeholder="Digite seu CPF ou CNPJ" inputMode="numeric" className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-3 text-white outline-none focus:border-cyan-300" />
      </label>
      <p className="mt-2 text-xs text-zinc-400">Necessário para emissão da cobrança pelo Asaas.</p>
      {!isValid ? <p className="mt-3 text-xs text-amber-200">Preencha seu nome e CPF/CNPJ para gerar a cobrança.</p> : null}
      {onBeforeContinue ? (
        <button type="button" disabled={!isValid} onClick={() => onBeforeContinue(checkoutHref)} className={`w-full ${continueClassName}`}>
          {children}
        </button>
      ) : (
        <a href={checkoutHref} aria-disabled={!isValid} className={continueClassName}>{children}</a>
      )}
    </div>
  );
}
