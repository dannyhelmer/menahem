// When a document is uploaded from the main chat composer (no project
// already selected), Menahem auto-creates one rather than asking first --
// this derives a reasonable name from the filename so that project doesn't
// just show up as "Untitled". Pure/client-safe (no Node APIs) so it can run
// directly in the browser before the upload request is even sent.
const BILL_PREFIX_LABELS: Record<string, string> = {
  hr: "H.R.",
  sb: "S.B.",
  hres: "H.Res.",
  sres: "S.Res.",
  hjres: "H.J.Res.",
  sjres: "S.J.Res.",
};

const GENERIC_NAME_RE = /^(document|file|untitled|scan|img|image|download|attachment)s?\d*$/i;

function titleCase(text: string): string {
  return text.replace(/\w+/g, (word) => {
    if (word.length <= 3 && word === word.toUpperCase()) return word; // keep acronyms (US, EPA, UN)
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function formatDateFallback(): string {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `Research – ${today}`;
}

export function deriveProjectName(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, "").trim();
  if (!base) return formatDateFallback();

  const billMatch = base.match(/^(h\.?\s?j\.?\s?res\.?|s\.?\s?j\.?\s?res\.?|h\.?\s?res\.?|s\.?\s?res\.?|h\.?\s?r\.?|s\.?\s?b\.?)\s*-?\s*(\d+)$/i);
  if (billMatch) {
    const prefix = billMatch[1].toLowerCase().replace(/[.\s]/g, "");
    const label = BILL_PREFIX_LABELS[prefix];
    if (label) return `${label} ${billMatch[2]}`;
  }

  const cleaned = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const isGeneric = GENERIC_NAME_RE.test(cleaned) || /^\d+$/.test(cleaned) || cleaned.length < 2;
  if (isGeneric) return formatDateFallback();

  return titleCase(cleaned);
}
