/** Lower case, one kind of quote mark, no punctuation: what is left is the words, in order. */
const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** Whether `needle` occurs in `haystack` as a run of whole words. */
function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}

/** A quote of fewer words than this has to be the whole caption line, or it proves nothing. */
const MIN_WORDS = 3;

/**
 * Whether a quote the model gave really appears in a caption: the same words in the same order,
 * ignoring case, punctuation and spacing. Anything else (a paraphrase, a dropped word, words from
 * two lines) does not count.
 */
export function quoteAppearsIn(quote: string, captionText: string): boolean {
  const wanted = words(quote);
  const line = words(captionText);
  if (wanted.length === 0) return false;
  if (wanted.length < MIN_WORDS) return wanted.length === line.length && containsRun(line, wanted);
  return containsRun(line, wanted);
}
