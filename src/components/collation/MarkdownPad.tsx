"use client";

import { useState } from "react";
import { Eye, Pencil } from "lucide-react";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline spans: code, bold, italic, links. Operates on already-escaped text. */
function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
}

/** Minimal, dependency-free Markdown → HTML for the notepad preview: headings,
 *  bold/italic/code, links, ordered/unordered lists, blockquotes, fenced code,
 *  paragraphs. Input is HTML-escaped first. */
export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let inCode = false;
  let list: "" | "ul" | "ol" = "";
  const closeList = () => { if (list) { out.push(`</${list}>`); list = ""; } };
  for (const raw of lines) {
    if (/^```/.test(raw)) {
      if (inCode) { out.push("</code></pre>"); inCode = false; }
      else { closeList(); out.push("<pre><code>"); inCode = true; }
      continue;
    }
    if (inCode) { out.push(raw); continue; }
    const h = raw.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    const ul = raw.match(/^\s*[-*]\s+(.*)$/);
    const ol = raw.match(/^\s*\d+\.\s+(.*)$/);
    if (ul) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(ul[1])}</li>`); continue; }
    if (ol) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(ol[1])}</li>`); continue; }
    const bq = raw.match(/^>\s?(.*)$/);
    if (bq) { closeList(); out.push(`<blockquote>${inline(bq[1])}</blockquote>`); continue; }
    if (raw.trim() === "") { closeList(); continue; }
    closeList();
    out.push(`<p>${inline(raw)}</p>`);
  }
  if (inCode) out.push("</code></pre>");
  closeList();
  return out.join("\n");
}

/** A notepad with a Markdown ⇄ Rich-text toggle. Edits flow up via onChange. */
export function MarkdownPad({ value, onChange, placeholder, autoFocus, readOnly }: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const box = "min-h-[44vh] max-h-[62vh] overflow-auto";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex rounded border border-border overflow-hidden text-[11px] self-end">
        <button onClick={() => setPreview(false)} className={"inline-flex items-center gap-1 px-2 py-0.5 " + (!preview ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          <Pencil className="w-3 h-3" /> {readOnly ? "Source" : "Markdown"}
        </button>
        <button onClick={() => setPreview(true)} className={"inline-flex items-center gap-1 px-2 py-0.5 " + (preview ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          <Eye className="w-3 h-3" /> Rich text
        </button>
      </div>
      {preview ? (
        <div
          className={"sv-markdown px-1 text-[13px] leading-relaxed " + box}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<p class="opacity-40">Nothing to preview.</p>' }}
        />
      ) : (
        <textarea
          autoFocus={autoFocus}
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className={"w-full bg-background border border-border rounded px-3 py-2 text-[12.5px] font-mono resize-y " + box}
        />
      )}
    </div>
  );
}
