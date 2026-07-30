// A research project is the notebook's unit of persistent work -- it
// accumulates notes, citations, saved graph entities, and linked
// conversations over time, unlike a one-shot chat session.
export interface ResearchNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface Citation {
  id: string;
  title: string;
  url: string;
  addedAt: string;
}

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  entityIds: string[];
  conversationIds: string[];
  notes: ResearchNote[];
  citations: Citation[];
}
