import Sidebar from "@/app/_components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-neutral-950">
      <Sidebar />
      {children}
    </div>
  );
}
