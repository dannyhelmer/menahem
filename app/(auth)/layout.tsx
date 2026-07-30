export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white px-6 dark:bg-neutral-950">
      {children}
    </div>
  );
}
