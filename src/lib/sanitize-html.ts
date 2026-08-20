/** Tags kept for article body preview / stored HTML. */
const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "s",
  "section",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "rel", "target"]),
  img: new Set(["src", "srcset", "sizes", "alt", "title", "width", "height", "loading"]),
  source: new Set(["src", "srcset", "sizes", "type", "media"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
};

const GLOBAL_ATTRS = new Set(["id", "class", "role"]);

/**
 * Browser-safe sanitizer for article HTML preview.
 * Strips scripts/handlers and drops tags outside the content allowlist.
 */
export function sanitizeArticleHtml(html: string): string {
  if (!html || typeof window === "undefined") return html || "";

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
  const root = doc.getElementById("__root");
  if (!root) return "";

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (!ALLOWED_TAGS.has(tag)) {
          // Unwrap unknown containers so text/images inside aren't lost; drop void junk.
          if (el.childNodes.length) {
            while (el.firstChild) {
              node.insertBefore(el.firstChild, el);
            }
          }
          el.remove();
          continue;
        }

        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on") || name === "style") {
            el.removeAttribute(attr.name);
            continue;
          }
          const allowed = ALLOWED_ATTRS[tag] || GLOBAL_ATTRS;
          if (!allowed.has(name) && !GLOBAL_ATTRS.has(name)) {
            el.removeAttribute(attr.name);
            continue;
          }
          if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attr.value)) {
            el.removeAttribute(attr.name);
          }
        }

        if (tag === "a") {
          el.setAttribute("rel", "noopener noreferrer");
          el.setAttribute("target", "_blank");
        }

        walk(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };

  walk(root);
  return root.innerHTML;
}
