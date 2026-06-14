"use client";

import { useRef, useState, type ReactNode } from "react";
import { Eye, Pencil, Code2 } from "lucide-react";
import { highlightRanges, tokenStyle, LANGS } from "@/lib/highlight";

function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/** Whole-text syntax highlight (read-only) for the Code view. */
function highlightAll(text: string, lang: string, dark: boolean): ReactNode {
  if (!lang || lang === "none" || !text) return text;
  const tokens = highlightRanges(text, lang);
  if (!tokens.length) return text;
  const out: ReactNode[] = [];
  let cursor = 0, key = 0;
  for (const tk of tokens) {
    if (tk.from >= text.length) break;
    const s = Math.max(0, tk.from), e = Math.min(text.length, tk.to);
    if (s > cursor) out.push(text.slice(cursor, s));
    if (e > s) { const st = tokenStyle(tk.tag, dark); out.push(st ? <span key={key++} style={st}>{text.slice(s, e)}</span> : text.slice(s, e)); cursor = e; }
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline spans: code, bold, italic, links. Operates on already-escaped text. */
function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])__([^_]+)__/g, "$1<strong>$2</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?—-]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
}

const isTableSep = (s: string) => /\|/.test(s) && /^[\s|:-]+$/.test(s) && s.includes("-");
const tableCells = (s: string) => s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** Minimal, dependency-free Markdown → HTML for the notepad preview: headings,
 *  bold/italic/code, links, lists, blockquotes, fenced code, GFM pipe tables,
 *  paragraphs. Input is HTML-escaped first. */
export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let inCode = false;
  let list: "" | "ul" | "ol" = "";
  const closeList = () => { if (list) { out.push(`</${list}>`); list = ""; } };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^```/.test(raw)) {
      if (inCode) { out.push("</code></pre>"); inCode = false; }
      else { closeList(); out.push("<pre><code>"); inCode = true; }
      continue;
    }
    if (inCode) { out.push(raw); continue; }
    // GFM pipe table: a row with pipes followed by a |---|---| separator.
    if (raw.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeList();
      const head = tableCells(raw);
      i++; // consume separator
      const body: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].includes("|") && lines[i + 1].trim() !== "") { i++; body.push(tableCells(lines[i])); }
      out.push("<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>"
        + body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
      continue;
    }
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

/** A notepad with Markdown / Rich-text and (optionally) a syntax-highlighted
 *  Code view. Edits flow up via onChange. */
export function MarkdownPad({ value, onChange, placeholder, autoFocus, readOnly, codeMode, defaultLang }: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  /** Enable the syntax-highlighted Code view (with a language picker). */
  codeMode?: boolean;
  defaultLang?: string;
}) {
  const [view, setView] = useState<"edit" | "rich" | "code">("edit");
  const [lang, setLang] = useState(defaultLang ?? "none");
  const box = "min-h-[44vh] max-h-[62vh] overflow-auto";
  const tab = (v: "edit" | "rich" | "code", icon: ReactNode, label: string) => (
    <button onClick={() => setView(v)} className={"inline-flex items-center gap-1 px-2 py-0.5 " + (view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{icon} {label}</button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 self-end">
        {view === "code" && (
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="text-[11px] rounded border border-border bg-card px-1 py-0.5">
            <option value="none">No highlighting</option>
            <optgroup label="Modern">{LANGS.filter((l) => l.group === "modern").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</optgroup>
            <optgroup label="Historical">{LANGS.filter((l) => l.group === "historical").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</optgroup>
          </select>
        )}
        <div className="flex rounded border border-border overflow-hidden text-[11px]">
          {tab("edit", <Pencil className="w-3 h-3" />, readOnly ? "Source" : "Markdown")}
          {tab("rich", <Eye className="w-3 h-3" />, "Rich text")}
          {codeMode && tab("code", <Code2 className="w-3 h-3" />, "Code")}
        </div>
      </div>
      {view === "rich" ? (
        <div className={"sv-markdown px-1 text-[13px] leading-relaxed " + box} dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<p class="opacity-40">Nothing to preview.</p>' }} />
      ) : view === "code" ? (
        <pre className={"bg-background border border-border rounded px-3 py-2 text-[12px] whitespace-pre-wrap break-words " + box} style={{ fontFamily: "var(--code-font-family)" }}><code>{highlightAll(value, lang, isDarkMode())}</code></pre>
      ) : (
        <SourceEditor value={value} onChange={onChange} autoFocus={autoFocus} readOnly={readOnly} placeholder={placeholder} lang="markdown" />
      )}
    </div>
  );
}

/** Editable source with a syntax-highlighted overlay: a transparent textarea over
 *  a coloured <pre> (identical metrics, synced scroll). Used for the Markdown
 *  view so the raw markdown reads with highlighting while staying editable. */
function SourceEditor({ value, onChange, autoFocus, readOnly, placeholder, lang }: {
  value: string; onChange?: (v: string) => void; autoFocus?: boolean; readOnly?: boolean; placeholder?: string; lang: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const dark = isDarkMode();
  const sync = () => { const ta = taRef.current, pre = preRef.current; if (ta && pre) { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; } };
  const shared = "absolute inset-0 m-0 px-3 py-2 text-[12.5px] whitespace-pre-wrap break-words overflow-auto";
  const metrics: React.CSSProperties = { fontFamily: "var(--code-font-family)", lineHeight: "1.5", tabSize: 2 };
  return (
    <div className="relative min-h-[44vh] max-h-[62vh] h-[52vh] border border-border rounded bg-background overflow-hidden">
      <pre ref={preRef} aria-hidden className={shared + " pointer-events-none"} style={metrics}>
        {value ? highlightAll(value + "\n", lang, dark) : <span className="opacity-40">{placeholder}</span>}
      </pre>
      <textarea
        ref={taRef}
        autoFocus={autoFocus}
        readOnly={readOnly}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onScroll={sync}
        spellCheck={false}
        className={shared + " bg-transparent resize-none"}
        style={{ ...metrics, color: "transparent", caretColor: "var(--foreground)", WebkitTextFillColor: "transparent" }}
      />
    </div>
  );
}
