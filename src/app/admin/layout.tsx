import { redirect } from "next/navigation";

import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUserAccessContext();
  if (current.isGuest) redirect('/login');
  if (!current.isAdmin) redirect('/biblioteca');

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1600px]">
        <Sidebar />
        <main className="w-full px-3 pb-28 pt-3 sm:p-6 lg:p-8">
          <Topbar />
          {children}
        </main>
      </div>
    </div>
  );
}
