import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1600px]">
        <Sidebar />
        <main className="w-full p-4 sm:p-6 lg:p-8">
          <Topbar />
          {children}
        </main>
      </div>
    </div>
  );
}
