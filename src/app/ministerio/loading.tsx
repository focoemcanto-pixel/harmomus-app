export default function MinistryLoading() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#020617] px-4 py-6 text-white md:px-8 md:py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_88%_20%,rgba(217,70,239,0.1),transparent_35%)]" />
      <section className="relative mx-auto max-w-7xl space-y-6">
        <div className="flex gap-2 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-11 w-28 shrink-0 animate-pulse rounded-2xl bg-white/10" />
          ))}
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-gradient-to-br from-[#0b1120]/80 via-[#140d27]/80 to-[#06111f]/80 p-6 md:p-10">
          <div className="h-8 w-44 animate-pulse rounded-full bg-cyan-300/10" />
          <div className="mt-7 h-12 max-w-xl animate-pulse rounded-2xl bg-white/10" />
          <div className="mt-4 h-5 max-w-2xl animate-pulse rounded-xl bg-white/10" />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.04]" />
          <div className="h-72 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.04]" />
        </div>
      </section>
    </main>
  );
}
