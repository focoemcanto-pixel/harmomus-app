import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-premium">
        <h1 className="text-2xl font-semibold text-foreground">Harmomus Studio</h1>
        <p className="mt-2 text-muted">Fundação da central administrativa pronta.</p>
        <Link href="/admin" className="mt-6 inline-flex rounded-lg border border-gold-500/40 px-4 py-2 text-gold-300">
          Acessar painel
        </Link>
      </div>
    </main>
  );
}
