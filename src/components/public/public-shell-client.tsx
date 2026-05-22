"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useRef } from "react";

import { UpgradeRequiredModal } from "@/components/public/upgrade-required-modal";
import type { CurrentUserAccessContext } from "@/lib/auth/current-user";

interface SearchItem { id: string; slug: string; name: string; artist: string; category: string; searchText: string }

export function PublicShellClient({ context, searchItems }: { context: CurrentUserAccessContext; searchItems: SearchItem[] }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeConfig, setUpgradeConfig] = useState({
    title: "Upgrade necessário",
    message: "Faça upgrade para continuar.",
    ctaLabel: "Assinar Premium",
    ctaHref: "/assinar?plan=premium",
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.toLowerCase().trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickOutside(ev: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(ev.target as Node)) setQuery("");
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results = useMemo(() => {
    if (!debounced) return [];
    return searchItems.filter((item) => item.searchText.includes(debounced)).slice(0, 8);
  }, [debounced, searchItems]);

  function onProtectedClick(type: "plus" | "premium") {
    const allowedPlus = context.effectiveSlug === "plus" || context.effectiveSlug === "premium";
    const allowedPremium = context.effectiveSlug === "premium";
    if ((type === "plus" && !allowedPlus) || (type === "premium" && !allowedPremium)) {
      const isPlus = type === "plus";
      setUpgradeConfig({
        title: isPlus ? "Este recurso requer plano Plus ou Premium." : "Este recurso requer plano Premium.",
        message: isPlus ? "Faça upgrade para desbloquear suas playlists privadas." : "Desbloqueie o acesso premium completo agora.",
        ctaLabel: isPlus ? "Assinar Plus" : "Assinar Premium",
        ctaHref: isPlus ? "/assinar?plan=plus" : "/assinar?plan=premium",
      });
      setUpgradeOpen(true);
      return false;
    }
    return true;
  }

  return (
    <>
      <div className="relative mx-1 hidden flex-1 md:block" ref={searchRef}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar kits, artista ou categoria" className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-sm outline-none ring-cyan-300/40 transition focus:ring" />
        {results.length > 0 ? <div className="absolute left-0 right-0 top-12 z-50 rounded-xl border border-white/10 bg-[#0d1220] p-2 shadow-premium">{results.map((item) => <Link key={item.id} href={`/biblioteca/${item.slug}`} onClick={() => setQuery("")} className="block rounded-lg px-3 py-2 hover:bg-white/5"><p className="text-sm text-white">{item.name}</p><p className="text-xs text-zinc-300">{item.artist} • {item.category}</p></Link>)}</div> : null}
      </div>
      <Link href="/todos-os-kits" className="rounded-lg border border-white/20 px-3 py-2 text-xs text-zinc-100 md:text-sm">Todos os Kits</Link>
      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xs font-semibold">{(context.profile?.full_name ?? context.profile?.email ?? "U").slice(0, 1).toUpperCase()}</button>
        {menuOpen ? <div className="absolute right-0 top-11 z-50 min-w-52 rounded-xl border border-white/10 bg-[#0d1220] p-2">
          {context.isGuest ? <>
            <Link href="/login" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Entrar</Link>
            <Link href="/assinatura" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Assinar</Link>
          </> : <>
            <Link href="/perfil" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Perfil</Link>
            <Link href="/assinatura" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Assinatura</Link>
            <Link href="/minhas-playlists" onClick={(e) => { if (!onProtectedClick("plus")) e.preventDefault(); }} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Minhas Playlists</Link>
            <Link href="/comunidade" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Comunidade Harmomus</Link>
            <Link href="/premium-vip" onClick={(e) => { if (!onProtectedClick("premium")) e.preventDefault(); }} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Premium VIP</Link>
            <Link href="/area-premium" onClick={(e) => { if (!onProtectedClick("premium")) e.preventDefault(); }} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Área Premium</Link>
            <Link href="/logout" className="block rounded-lg px-3 py-2 text-sm text-rose-300 hover:bg-white/5">Sair</Link>
          </>}
        </div> : null}
      </div>
      <UpgradeRequiredModal
        open={upgradeOpen}
        title={upgradeConfig.title}
        message={upgradeConfig.message}
        ctaLabel={upgradeConfig.ctaLabel}
        ctaHref={upgradeConfig.ctaHref}
        onClose={() => setUpgradeOpen(false)}
      />
    </>
  );
}
