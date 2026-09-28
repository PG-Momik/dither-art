/**
 * Minimal JS/TS colouring for the code samples on this site.
 *
 * Comments and strings are matched before anything else, so a `//` or a keyword inside a string
 * is never mistaken for code. Everything else falls through as plain ink, which keeps the result
 * quiet: four colours, not a rainbow.
 */
const KEYWORDS = new Set([
  "import", "export", "from", "const", "let", "var", "function", "return", "new", "type",
  "interface", "await", "async", "if", "else", "for", "of", "in", "typeof", "as", "default",
  "class", "extends", "throw", "try", "catch", "readonly",
]);

const TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.:=<>+\-*/!?&|%])/g;

export const escapeHtml = (text) =>
  text.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);

const wrap = (className, text) => `<span class="${className}">${escapeHtml(text)}</span>`;

/** Returns HTML. The input is treated as text throughout, so it is safe for generated snippets. */
export const highlight = (source) => {
  let out = "";
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    const [text, comment, string, number, word, punctuation] = match;
    out += escapeHtml(source.slice(last, match.index));
    last = match.index + text.length;
    if (comment) out += wrap("tok-mut", text);
    else if (string) out += wrap("tok-str", text);
    else if (number) out += wrap("tok-num", text);
    else if (word) {
      const isCall = source[last] === "(";
      out += KEYWORDS.has(word) ? wrap("tok-key", text) : isCall ? wrap("tok-fn", text) : escapeHtml(text);
    } else if (punctuation) out += wrap("tok-mut", text);
  }
  return out + escapeHtml(source.slice(last));
};

/** Colours an element's existing text content in place. */
export const highlightElement = (element) => {
  element.innerHTML = highlight(element.textContent);
};
