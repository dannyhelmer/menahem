// A bare, very short message (a greeting, thanks, or placeholder like "test")
// skips the heavier classify/tool-routing pipeline entirely -- ported from
// the Python app's tools/fast_path.py. Matching is exact (after normalizing
// whitespace/case/trailing punctuation), never substring, so it never fires
// on a short message that's clearly a real request.
const FAST_PATH_PHRASES = new Set([
  "hi", "hello", "hey", "hiya", "yo", "howdy",
  "good morning", "good afternoon", "good evening",
  "thanks", "thank you", "thanks a lot", "thank you so much", "ty",
  "nice", "cool", "great", "awesome", "sweet", "perfect",
  "okay", "ok", "alright", "sure", "got it", "sounds good", "no worries",
  "bye", "goodbye", "good bye", "see you", "see ya", "take care",
  "later", "goodnight", "good night",
  "test", "testing", "test test", "testing testing", "one", "one two",
  "one two three", "lol", "lmao", "asdf", "123",
]);

// Subset of the above reserved for messages that look like the user is just
// checking the connection ("test", "one two three") -- these get a distinct
// "looks like you're testing me" acknowledgment instead of a generic greeting
// reply, since answering "test" with a dictionary definition reads badly.
const SYSTEM_TEST_PHRASES = new Set([
  "test", "testing", "test test", "testing testing", "one", "one two",
  "one two three", "asdf", "123",
]);

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?, ]+$/, "");
}

export function isFastPathMessage(text: string): boolean {
  return FAST_PATH_PHRASES.has(normalize(text));
}

export function isSystemTestMessage(text: string): boolean {
  return SYSTEM_TEST_PHRASES.has(normalize(text));
}

export const SYSTEM_TEST_GUIDANCE =
  "This message is a bare placeholder/test word (e.g. \"test\", \"one two three\") -- the user is almost " +
  "certainly just checking that you're responding, not asking for a definition or explanation of the word " +
  "itself. Acknowledge briefly and naturally (e.g. \"Looks like you're testing me -- everything's working. " +
  "What would you like to try?\"), don't define the word or launch into an explanation.";
