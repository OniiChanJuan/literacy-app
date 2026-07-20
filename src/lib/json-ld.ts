/**
 * Safe serialization for JSON-LD embedded in a
 * <script type="application/ld+json"> tag via dangerouslySetInnerHTML.
 *
 * JSON.stringify escapes quotes and backslashes but NOT '<', '>', or '&'.
 * Inside a raw-text <script> element the HTML parser still scans for the
 * literal "</script>", so a string field containing "</script>" — e.g. a
 * catalog title sourced from an external API or the import route — would
 * close the script element early and inject arbitrary markup (stored XSS).
 *
 * Replacing '<' '>' '&' with their \uXXXX escapes yields a string that is
 * still valid JSON (JSON-LD consumers parse it identically) but can never
 * break out of the script element. U+2028 / U+2029 are valid in JSON but
 * illegal as raw JavaScript line terminators, so escape those too. (The
 * separators are matched via new RegExp with a \\u escape rather than a
 * regex literal, since a raw U+2028 in source is itself a line break.)
 */
const LINE_SEP = new RegExp("\\u2028", "g");
const PARA_SEP = new RegExp("\\u2029", "g");

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEP, "\\u2028")
    .replace(PARA_SEP, "\\u2029");
}
