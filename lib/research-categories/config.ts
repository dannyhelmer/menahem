// Plain data only (no React/icons) so this can be imported from both client
// components (Dashboard, ResearchWorkspace) and the server-side chat route
// without pulling a UI dependency into the API bundle.
export interface ResearchCategoryConfig {
  slug: string;
  title: string;
  description: string;
  // Folded into the research pipeline's liveData for any message sent from
  // this category's page -- tells the model what domain the user is in,
  // the same mechanism the criticism/learning-mode guidance already use.
  contextHint: string;
  exampleSearches: string[];
}

export const RESEARCH_CATEGORIES: ResearchCategoryConfig[] = [
  {
    slug: "legislation",
    title: "Legislation",
    description: "Search bills, amendments, sponsors, committees and voting history.",
    contextHint:
      "The user is researching legislation -- bills, amendments, sponsors, committees, and voting history. " +
      "Prioritize bill text, sponsorship, status, and legislative history over general commentary.",
    exampleSearches: [
      "Explain HR 1",
      "Compare two bills",
      "Summarize amendments",
      "Find sponsors",
      "Show voting history",
    ],
  },
  {
    slug: "court-opinions",
    title: "Court Opinions",
    description: "Research Supreme Court and future federal/state opinions.",
    contextHint:
      "The user is researching court opinions -- Supreme Court and federal/state case law. Prioritize the " +
      "actual holding, majority/dissenting reasoning, and citation over general summary.",
    exampleSearches: [
      "Explain a landmark Supreme Court case",
      "Summarize a court opinion",
      "Find the holding in a case",
      "Compare two rulings",
    ],
  },
  {
    slug: "budgets",
    title: "Budgets",
    description: "Analyze government budgets, spending, departments and fiscal reports.",
    contextHint:
      "The user is researching government budgets -- spending, departments, revenue, and fiscal reports. " +
      "Prioritize actual figures and their sources over general commentary, and never state a specific dollar " +
      "figure that isn't backed by retrieved data.",
    exampleSearches: [
      "Summarize FY2026 budget",
      "Largest spending increases",
      "Compare two years",
      "Explain revenue sources",
    ],
  },
  {
    slug: "elections",
    title: "Elections",
    description: "Candidates, election laws, filings and future campaign information.",
    contextHint:
      "The user is researching elections -- candidates, election laws, filing requirements, and ballot " +
      "measures. Prioritize verified filings and official rules over general commentary.",
    exampleSearches: [
      "Filing requirements",
      "Election laws",
      "Candidate information",
      "Ballot measures",
    ],
  },
  {
    slug: "constitution",
    title: "Constitution",
    description: "Search constitutional articles, amendments and interpretations.",
    contextHint:
      "The user is researching the Constitution -- articles, amendments, and their interpretation. Prioritize " +
      "the actual text and well-established case law over general commentary, and clearly separate settled " +
      "interpretation from disputed/contested readings.",
    exampleSearches: [
      "Explain the Commerce Clause",
      "Search amendments",
      "Compare constitutional interpretations",
    ],
  },
  {
    slug: "agencies",
    title: "Government Agencies",
    description: "Research agencies, regulations and official guidance.",
    contextHint:
      "The user is researching government agencies -- regulations, executive orders, and administrative " +
      "guidance. Prioritize the actual regulatory text and its source agency over general commentary.",
    exampleSearches: [
      "EPA regulations",
      "Department of Education guidance",
      "Executive orders",
      "Administrative rules",
    ],
  },
];

export function getResearchCategory(slug: string): ResearchCategoryConfig | undefined {
  return RESEARCH_CATEGORIES.find((category) => category.slug === slug);
}
