// Ported from the Python app's tools/political_research.requires_live_data --
// deliberately narrower than the general political-intent classifier. These
// are the specific high-stakes claim shapes where a low-confidence answer
// must be hard-gated (the model call skipped entirely), not just asked
// nicely to hedge -- this project's own testing showed a soft instruction
// alone doesn't reliably stop fabrication.
const REQUIRES_LIVE_DATA_RE =
  /\b(who(?:'s|\s+is)\s+running|running (?:for|against)|candidates?|campaign finance|campaign contribution\w*|donor\w*|donat\w*|pac (?:money|contribution\w*|donation\w*)|election result\w*|who won|poll(?:ing|s)?\b|filing deadline\w*|bill status|status of (?:the |this )?bill|who is (?:the )?current\w*|current(?:ly)? (?:the )?(?:senator|representative|governor|mayor|congress(?:man|woman|person)?))\b/i;

export function requiresLiveData(text: string): boolean {
  return REQUIRES_LIVE_DATA_RE.test(text);
}

export const VERIFICATION_FAILED_MESSAGE =
  "I don't have verified, current information to answer this reliably, so I don't want to guess -- no official " +
  "government source or web search result was found for this specific question. If you configure a search " +
  "provider or Congress.gov/FEC key in Settings, I'll be able to look this up directly.";
