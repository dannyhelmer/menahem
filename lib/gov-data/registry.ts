import { congressProvider } from "./providers/congress";
import { fecProvider } from "./providers/fec";
import type { GovDataProvider } from "./types";

export const GOV_DATA_PROVIDERS: GovDataProvider[] = [congressProvider, fecProvider];

export { PLANNED_PROVIDERS } from "./types";
