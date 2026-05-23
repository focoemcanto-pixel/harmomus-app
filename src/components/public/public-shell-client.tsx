"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useRef } from "react";

import { UpgradeRequiredModal } from "@/components/public/upgrade-required-modal";
import type { CurrentUserAccessContext } from "@/lib/auth/current-user";

interface SearchItem { id: string; slug: string; name: string; artist: string; category: string; searchText: string }

function UserSilhouetteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-zinc-100">
      <path fill="currentColor" d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5Zm0 2c-3.87 0-8 2.03-8 5v1c0 .55.45 1 1 1h14c.55 0 1-.45 1-1v-1c0-2.97-4.13-5-8-5Z" />
    </svg>
  );
}

export function PublicShellClient({ context, searchItems }: { context: CurrentUserAccessContext; searchItems: SearchItem[] }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [liveAvatar, setLiveAvatar] = useState(context.profile?.avatar_url ?? null);
  const [upgradeConfig, setUpgradeConfig] = useState({
    title: "Upgrade necessário",
    message: "Faça upgrade para continuar.",
    ctaLabel: "Assinar Premium",
    ctaHref: "/assinar?plan=premium",
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const searchDesktopRef = useRef<HTMLDivElement>(null);
  const searchMobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.toLowerCase().trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickOutside(ev: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuOpen(false);
      const clickedDesktop = searchDesktopRef.current?.contains(ev.target as Node) ?? false;
      const clickedMobile = searchMobileRef.current?.contains(ev.target as Node) ?? false;
      if (!clickedDesktop && !clickedMobile) setQuery("");
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("harmomus-avatar-url");
    if (stored) setLiveAvatar(stored);

    function onAvatarUpdate() {
      const next = window.localStorage.getItem("harmomus-avatar-url");
      if (next) setLiveAvatar(next);
    }
    window.addEventListener("harmomus:avatar-updated", onAvatarUpdate as EventListener);
    return () => window.removeEventListener("harmomus:avatar-updated", onAvatarUpdate as EventListener);
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
        ctaLabel: "Assinar Premium",
        ctaHref: "/assinar?plan=premium",
      });
      setUpgradeOpen(true);
      return false;
    }
    return true;
  }

  const fallbackInitial = (context.profile?.full_name ?? context.profile?.email ?? "U").slice(0, 1).toUpperCase();

  return (
    <>
      <div className="min-w-0 flex-1 md:hidden" ref={searchMobileRef}>
        <div className="relative">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar kits" className="h-8 w-full rounded-lg border border-white/15 bg-white/5 px-2 text-xs text-white outline-none ring-cyan-300/40 transition placeholder:text-zinc-400 focus:ring" />
          {results.length > 0 ? <div className="absolute left-0 right-0 top-11 z-50 rounded-xl border border-white/10 bg-[#0d1220] p-2 shadow-premium">{results.map((item) => <Link key={item.id} href={`/biblioteca/${item.slug}`} onClick={() => setQuery("")} className="block rounded-lg px-3 py-2 hover:bg-white/5"><p className="text-sm text-white">{item.name}</p><p className="text-xs text-zinc-300">{item.artist} • {item.category}</p></Link>)}</div> : null}
        </div>
      </div>
      <div className="relative mx-1 hidden flex-1 md:block" ref={searchDesktopRef}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar kits, artista ou categoria" className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-sm outline-none ring-cyan-300/40 transition focus:ring" />
        {results.length > 0 ? <div className="absolute left-0 right-0 top-12 z-50 rounded-xl border border-white/10 bg-[#0d1220] p-2 shadow-premium">{results.map((item) => <Link key={item.id} href={`/biblioteca/${item.slug}`} onClick={() => setQuery("")} className="block rounded-lg px-3 py-2 hover:bg-white/5"><p className="text-sm text-white">{item.name}</p><p className="text-xs text-zinc-300">{item.artist} • {item.category}</p></Link>)}</div> : null}
      </div>
      <Link href="/todos-os-kits" className="whitespace-nowrap rounded-md border border-white/20 px-2 py-1.5 text-[11px] text-zinc-100 md:rounded-lg md:px-3 md:py-2 md:text-sm">Todos os Kits</Link>
      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen((v) => !v)} className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/5 text-xs font-semibold md:h-9 md:w-9">
          {liveAvatar ? <img src={liveAvatar} alt="avatar" className="h-full w-full object-cover" /> : context.isGuest ? <UserSilhouetteIcon /> : fallbackInitial}
        </button>
        {menuOpen ? <div className="absolute right-0 top-11 z-50 min-w-52 rounded-xl border border-white/10 bg-[#0d1220] p-2">
          {context.isGuest ? <>
            <Link href="/login" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Login</Link>
            <Link href="/cadastro" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">Cadastre-se</Link>
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
