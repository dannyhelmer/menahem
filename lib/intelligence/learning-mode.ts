// Cross-cutting learning-mode detection -- deterministic (no LLM call),
// matching this project's established regex-routing philosophy. Unlike the
// other classifiers in this folder, this one applies regardless of topic:
// "teach me algebra" and "teach me the 14th amendment" both trigger it, only
// one of them also happens to be political. Single source of truth for the
// pattern political-intent.ts uses to set its "learning_mode" intent.
const QUIZ_RE = /\bquiz me\b|\bpractice exam\b|\btest me\b/i;
const FLASHCARDS_RE = /\bflashcards?\b/i;
const SOCRATIC_RE = /\bsocratic\b/i;
const STUDY_GUIDE_RE = /\bstudy guide\b/i;
const EXPLAIN_LEVEL_RE = /\bexplain like i'?m\b/i;
const GENERAL_TEACH_RE = /\bteach me\b|\bhelp me (learn|study)\b/i;

export const LEARNING_MODE_RE = new RegExp(
  [QUIZ_RE, FLASHCARDS_RE, SOCRATIC_RE, STUDY_GUIDE_RE, EXPLAIN_LEVEL_RE, GENERAL_TEACH_RE]
    .map((re) => re.source)
    .join("|"),
  "i",
);

export function detectLearningMode(text: string): boolean {
  return LEARNING_MODE_RE.test(text);
}

// Most-specific format wins when a message could match more than one --
// e.g. "quiz me with flashcards" is still fundamentally a quiz request.
export function buildLearningModeGuidance(text: string): string {
  if (QUIZ_RE.test(text)) {
    return (
      "Learning mode -- quiz: the user wants to be quizzed or tested, not given a direct explanation. Generate " +
      "a short set of genuine test questions on the requested topic (multiple-choice, short-answer, or a mix) " +
      "and do NOT reveal the answers in this same message -- end by asking the user to answer, and offer to " +
      "check their answers once they respond. If their message already contains attempted answers, grade them " +
      "honestly (say plainly what's right and what's wrong) rather than just praising the attempt."
    );
  }
  if (FLASHCARDS_RE.test(text)) {
    return (
      "Learning mode -- flashcards: produce the material as a numbered set of flashcards, each with a short " +
      "front (a term or question) and back (the answer), at a study-appropriate level of granularity -- not a " +
      "long-form explanation."
    );
  }
  if (SOCRATIC_RE.test(text)) {
    return (
      "Learning mode -- Socratic method: guide the user toward the answer through a sequence of leading " +
      "questions rather than stating it directly. Ask one focused question at a time and build on their " +
      "response; only state the underlying fact or conclusion directly once they've reasoned most of the way " +
      "there themselves, or if they explicitly ask you to just tell them."
    );
  }
  if (STUDY_GUIDE_RE.test(text)) {
    return (
      "Learning mode -- study guide: structure the response as a study guide -- key terms, main concepts " +
      "grouped by subtopic, and a handful of review questions at the end -- rather than as ordinary prose."
    );
  }
  if (EXPLAIN_LEVEL_RE.test(text)) {
    return (
      "Learning mode -- leveled explanation: tailor vocabulary, analogies, and depth specifically to the " +
      "level or audience the user named, not a generically simplified version -- adjust further if they " +
      "indicate the level given wasn't quite right."
    );
  }
  return (
    "Learning mode -- teaching: prioritize a clear, structured, pedagogical explanation built up from " +
    "fundamentals, with a concrete example, over a terse direct-answer style. Briefly check their current " +
    "familiarity with the topic first if that would meaningfully change how to pitch the explanation."
  );
}
