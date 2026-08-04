import { isProductionDeployment } from "@/lib/env";

// Detailed, per-query retrieval tracing -- development only (never printed
// on Vercel/production, per isProductionDeployment()) so this never adds
// log volume or latency risk to real traffic. Every recorder function is a
// no-op when passed `undefined`, matching this codebase's established
// optional-callback idiom (onStage?.(), onProgress?.()) -- callers that
// don't want diagnostics (or are running in production) just pass nothing,
// no branching required at call sites.
export interface RetrievalDiagnostics {
  routerInvoked: boolean;
  officialDomains: string[];
  officialLabels: string[];
  searchQueries: { phase: string; query: string }[];
  resultsPerDomain: Record<string, number>;
  fetched: { url: string; title: string }[];
  failedFetches: { url: string; error: string }[];
  documentsProvided: { url: string; title: string }[];
}

export function createRetrievalDiagnostics(): RetrievalDiagnostics {
  return {
    routerInvoked: false,
    officialDomains: [],
    officialLabels: [],
    searchQueries: [],
    resultsPerDomain: {},
    fetched: [],
    failedFetches: [],
    documentsProvided: [],
  };
}

// Only ever create a real diagnostics object outside production -- callers
// hold onto the (possibly undefined) result and pass it straight through;
// every record* function below already tolerates undefined.
export function maybeCreateRetrievalDiagnostics(): RetrievalDiagnostics | undefined {
  return isProductionDeployment() ? undefined : createRetrievalDiagnostics();
}

export function recordRouterInvocation(diag: RetrievalDiagnostics | undefined, domains: string[], labels: string[]): void {
  if (!diag) return;
  diag.routerInvoked = true;
  diag.officialDomains = domains;
  diag.officialLabels = labels;
}

export function recordSearchQuery(diag: RetrievalDiagnostics | undefined, phase: string, query: string): void {
  diag?.searchQueries.push({ phase, query });
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function recordRawResults(diag: RetrievalDiagnostics | undefined, results: { url: string }[]): void {
  if (!diag) return;
  for (const r of results) {
    const host = hostnameOf(r.url);
    diag.resultsPerDomain[host] = (diag.resultsPerDomain[host] ?? 0) + 1;
  }
}

export function recordFetchSuccess(diag: RetrievalDiagnostics | undefined, url: string, title: string): void {
  diag?.fetched.push({ url, title });
}

export function recordFetchFailure(diag: RetrievalDiagnostics | undefined, url: string, error: string): void {
  diag?.failedFetches.push({ url, error });
}

export function recordDocumentsProvided(diag: RetrievalDiagnostics | undefined, documents: { url: string; title: string }[]): void {
  if (!diag) return;
  diag.documentsProvided = documents;
}

// Prints the full 7-point trace the retrieval pipeline redesign asked for:
// (1) whether the router was invoked, (2) which official domains it picked,
// (3) every search query issued, (4) result counts per domain, (5) which
// pages were fetched successfully, (6) which failed and why, (7) which
// documents actually made it into the model's context.
export function printRetrievalDiagnostics(question: string, diag: RetrievalDiagnostics): void {
  if (isProductionDeployment()) return;
  console.group(`[retrieval-diagnostics] "${question.slice(0, 100)}"`);
  console.log("1. Domain router invoked:", diag.routerInvoked);
  console.log("2. Official domains selected:", diag.officialDomains, "labels:", diag.officialLabels);
  console.log("3. Search queries issued:", diag.searchQueries);
  console.log("4. Results returned per domain:", diag.resultsPerDomain);
  console.log(`5. Pages successfully fetched (${diag.fetched.length}):`, diag.fetched);
  console.log(`6. Pages that failed to fetch (${diag.failedFetches.length}):`, diag.failedFetches);
  console.log(`7. Documents ultimately provided to the model (${diag.documentsProvided.length}):`, diag.documentsProvided);
  console.groupEnd();
}
