"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: "Kit" | "Categoria" | "Membro" | "Plano";
};

const typeClassName: Record<SearchResult["type"], string> = {
  Kit: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
  Categoria: "border-gold-400/30 bg-gold-500/10 text-gold-100",
  Membro: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  Plano: "border-purple-400/30 bg-purple-500/10 text-purple-100",
};

export function AdminGlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Falha ao buscar resultados.");
        const payload = await response.json();
        setResults(Array.isArray(payload.results) ? payload.results : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Não foi possível buscar agora.");
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, trimmedQuery]);

  const statusText = useMemo(() => {
    if (trimmedQuery.length < 2) return "Digite pelo menos 2 letras.";
    if (loading) return "Buscando...";
    if (error) return error;
    if (!results.length) return "Nenhum resultado encontrado.";
    return `${results.length} resultado(s)`;
  }, [error, loading, results.length, trimmedQuery.length]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-w-[280px] items-center justify-between rounded-2xl border border-border bg-background/70 px-4 py-2.5 text-sm text-muted transition hover:border-gold-500/40 hover:text-foreground md:flex"
      >
        <span className="flex items-center gap-2">
          <Search size={16} />
          Pesquisar no admin...
        </span>
        <span className="rounded-lg border border-border bg-surface px-2 py-0.5 text-[11px] text-muted">⌘K</span>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 text-muted transition hover:border-gold-500/40 hover:text-foreground md:hidden"
        aria-label="Pesquisar no admin"
      >
        <Search size={16} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="mx-auto mt-16 max-w-2xl overflow-hidden rounded-3xl border border-border bg-surface shadow-premium"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-4">
              <Search size={18} className="text-gold-300" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar kits, membros, categorias ou planos..."
                className="h-10 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border p-2 text-muted transition hover:text-foreground"
                aria-label="Fechar busca"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-3">
              <p className="px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted">{statusText}</p>
              <div className="space-y-2">
                {results.map((result) => (
                  <Link
                    key={result.id}
                    href={result.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-2xl border border-transparent p-4 transition hover:border-gold-500/30 hover:bg-background/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{result.title}</p>
                        <p className="mt-1 truncate text-xs text-muted">{result.subtitle}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${typeClassName[result.type]}`}>
                        {result.type}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
