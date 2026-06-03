import { HomePollCreateForm } from "@/components/admin/home-poll-create-form";

export default function NovaEnquetePage() {
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Nova enquete</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Digite as músicas manualmente, uma por linha. Ideal para decidir o próximo kit vocal da semana.
        </p>
      </div>

      <HomePollCreateForm />
    </section>
  );
}
