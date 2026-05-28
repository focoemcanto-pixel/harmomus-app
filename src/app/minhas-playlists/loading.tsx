export default function MinhasPlaylistsLoading() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 text-white md:px-6">
      <section className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="animate-pulse rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="h-4 w-32 rounded-full bg-white/10" />
          <div className="mt-4 h-9 w-64 rounded-full bg-white/10" />
          <div className="mt-4 h-4 max-w-2xl rounded-full bg-white/10" />
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
              <div className="aspect-[16/9] animate-pulse bg-white/10" />
              <div className="space-y-3 p-5">
                <div className="h-4 w-3/4 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-1/2 animate-pulse rounded-full bg-white/10" />
                <div className="border-t border-white/5 pt-3">
                  <div className="h-8 w-full animate-pulse rounded-xl bg-white/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
