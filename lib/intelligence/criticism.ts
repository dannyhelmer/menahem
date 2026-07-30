// Detects the user reacting critically to Menahem's own previous reply --
// ported from the Python app's core/conversation_manager.py. A conservative
// pattern match, not sentiment analysis, deliberately narrow so it never
// fires on an ordinary negative statement about something else.
const CRITICISM_RE =
  /\b(that (sucked|was (bad|terrible|wrong|awful|dumb|stupid))|you'?re (stupid|dumb|wrong|useless|an idiot)|(terrible|bad|awful|dumb|wrong|useless|garbage) (answer|response|reply)|this is (so )?(stupid|dumb|useless|garbage)|you (don'?t know what you'?re talking about|have no idea)|f\*+ck(ing)?|f-ck(ing)?|piss(ing)? (me )?off|holy (shit|s\*+t))\b/i;

export function detectCriticism(text: string): boolean {
  return CRITICISM_RE.test(text);
}

export const CRITICISM_GUIDANCE =
  "The user's message reads as criticism of or frustration with your own previous reply, not a request " +
  "for new information. Briefly self-review that previous reply against what they said. If you can " +
  "identify a real, specific mistake (misunderstood the question, a factual error, missed context, a " +
  "genuinely weak answer), acknowledge it in one short sentence and give a better answer directly -- " +
  "don't ask permission first. If you genuinely can't tell what was wrong, ask ONE brief, specific " +
  'question about what missed the mark (e.g. "What part didn\'t work for you?") instead of guessing. ' +
  "Either way, respond briefly and naturally, lightly matching their tone without becoming defensive, " +
  'apologetic, or corporate. Never say things like "I\'m sorry if my response didn\'t meet your ' +
  'expectations," "thank you for your feedback," or "I\'d be happy to assist further" -- a real person ' +
  'would just say something like "Fair enough, let me try again" or "What did I get wrong?"';
