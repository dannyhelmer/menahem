// Placeholder payment method icons for the pricing page. These are simple,
// styled text badges rather than brand SVGs -- they communicate which payment
// methods are accepted without shipping copyrighted brand assets. When real
// Stripe Checkout is wired up, these can be replaced with official brand marks.

const PAYMENT_METHODS = [
  { label: "VISA", className: "text-[10px] font-bold italic tracking-wider text-blue-700" },
  { label: "MC", className: "text-[10px] font-bold text-orange-600" },
  { label: "AMEX", className: "text-[9px] font-bold tracking-wide text-blue-500" },
  { label: "Pay", className: "text-[10px] font-semibold text-neutral-700 dark:text-neutral-300" },
  { label: "G Pay", className: "text-[10px] font-semibold text-neutral-600 dark:text-neutral-400" },
] as const;

export default function PaymentIcons() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {PAYMENT_METHODS.map((method) => (
        <div
          key={method.label}
          className="flex h-8 min-w-[40px] items-center justify-center rounded-md border border-neutral-200 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <span className={method.className}>{method.label}</span>
        </div>
      ))}
    </div>
  );
}