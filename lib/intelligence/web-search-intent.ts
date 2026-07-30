// Conservative regex/keyword heuristics for whether a message needs web
// search -- ported from the Python app's tools/web_search/intent.py.

const RECENCY_RE =
  /\b(latest|current(ly)?|recent(ly)?|this (week|month|year)|right now|as of (now|today)|up[- ]to[- ]date|breaking news|today'?s|tonight'?s|yesterday'?s?|last night|happening (today|tonight|right now|now)|what'?s (happening|going on)|who is the current \w+|who won\b|what('s| is) (the )?(latest|current))\b/i;

// Explicit user request to search, regardless of whether the message would
// otherwise look like it needs live info -- always honored even for a
// message that would otherwise skip search entirely (e.g. "search the web
// for the plot of Hamlet").
const EXPLICIT_SEARCH_OVERRIDE_RE =
  /\b(search (the web|online|the internet)|look (this|it) up|find (me )?sources|use web search|go online and|check online)\b/i;

const HISTORICAL_RE =
  /\b(history of|historical(ly)?|in (18|19|20)\d{2}|incident|assassination(s)?|scandal|treaty|battle of|war of|siege of|what happened (to|when|during)|during (his|her|their) (presidency|administration|term|career|visit|tenure))\b/i;

const OFFLINE_REQUEST_RE =
  /\b(local ai only|local model only|offline mode|(don'?t|do not) (search|use) the (web|internet)|(don'?t|do not) go online|without (searching|going online|internet)|no internet|without internet access|just (use|answer from) your (own )?(training|knowledge|memory))\b/i;

const ENTITY_LOOKUP_PHRASING_RE =
  /\b(tell me about|who is|who'?s|what do you know about|background on|information about|info on|details on)\b/i;
const PROPER_NAME_HINT_RE = /\b[A-Z][A-Za-z]*\s+[A-Z][a-zA-Z]*\b/;

export function detectRecencyNeed(text: string): boolean {
  return RECENCY_RE.test(text);
}

export function detectHistoricalVerificationNeed(text: string): boolean {
  return HISTORICAL_RE.test(text);
}

export function detectOfflineRequest(text: string): boolean {
  return OFFLINE_REQUEST_RE.test(text);
}

export function detectEntityLookupNeed(text: string): boolean {
  return ENTITY_LOOKUP_PHRASING_RE.test(text) && PROPER_NAME_HINT_RE.test(text);
}

export function detectExplicitSearchOverride(text: string): boolean {
  return EXPLICIT_SEARCH_OVERRIDE_RE.test(text);
}
