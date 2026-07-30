// Read-only status row -- shows whether Menahem's server has a given
// provider configured, never the key itself and never an input to change
// it. Provider credentials are deployment-level configuration (server env
// vars), not something an individual user sets up.
export default function ProviderStatusRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-44 shrink-0 text-neutral-700 dark:text-neutral-300">{label}</span>
      {configured ? (
        <span className="flex items-center gap-1.5 text-green-700 dark:text-green-500">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          Configured
        </span>
      ) : (
        <span className="text-neutral-400 dark:text-neutral-500">Not configured</span>
      )}
    </div>
  );
}
