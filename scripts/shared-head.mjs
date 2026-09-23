import { parse } from "parse5";

export const SHARED_HEAD_PLACEHOLDER = "<!-- SITEAUDIT:SHARED_HEAD -->";
export const PAGE_HEAD_PLACEHOLDER = "{{ page.head }}";

export function readHead(html, label = "HTML") {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const root = document.childNodes.find((node) => node.tagName === "html");
  const head = root?.childNodes.find((node) => node.tagName === "head");
  const location = head?.sourceCodeLocation;
  if (!location?.startTag || !location?.endTag) {
    throw new Error(label + " must contain an explicit, correctly closed <head>.");
  }
  return { head, location, document };
}

export function renderSharedHead(template, pageHead) {
  if (typeof pageHead !== "string") throw new Error("Missing page-specific head metadata.");
  if (template.split(PAGE_HEAD_PLACEHOLDER).length !== 2) {
    throw new Error("siteaudit-head.html must contain {{ page.head }} exactly once.");
  }
  // Use a callback: dollar sequences in HTML/JavaScript are literal content.
  const rendered = template.replace(PAGE_HEAD_PLACEHOLDER, () => pageHead);
  const { location } = readHead(rendered, "siteaudit-head.html");
  const outside = rendered.slice(0, location.startOffset) + rendered.slice(location.endOffset);
  if (outside.replace(/<!--[\s\S]*?-->/g, "").trim()) {
    throw new Error("siteaudit-head.html may contain only its <head> and surrounding comments.");
  }
  return rendered.slice(location.startOffset, location.endOffset);
}

export function replaceSharedHead(html, template, pageHead, label) {
  if (html.split(SHARED_HEAD_PLACEHOLDER).length !== 2) {
    throw new Error(label + " must contain one shared-head template reference.");
  }
  return html.replace(SHARED_HEAD_PLACEHOLDER, () => renderSharedHead(template, pageHead));
}
