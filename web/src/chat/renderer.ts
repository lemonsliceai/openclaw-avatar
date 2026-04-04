/**
 * Chat rendering — markdown-to-HTML conversion, chat log DOM management.
 *
 * Extracted from `web/app.js` renderer functions.
 * Pure rendering logic — no state mutations except through callbacks.
 */

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeChatHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeChatHtmlAttribute(value: string): string {
  return escapeChatHtml(value).replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

export function normalizeChatHref(href: string): string {
  if (typeof href !== "string") return "";
  const trimmed = href.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, window.location.href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // Invalid URL — fall through.
  }
  return "";
}

export function normalizeChatImageSrc(src: string): string {
  if (typeof src !== "string") return "";
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (/^blob:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return "";
}

// ---------------------------------------------------------------------------
// Inline markdown rendering
// ---------------------------------------------------------------------------

export function renderChatMarkdownInline(value: string): string {
  let result = escapeChatHtml(value);

  // Images: ![alt](src)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, src: string) => {
    const normalizedSrc = normalizeChatImageSrc(src);
    if (!normalizedSrc) return escapeChatHtml(`![${alt}](${src})`);
    return `<img src="${escapeChatHtmlAttribute(normalizedSrc)}" alt="${escapeChatHtmlAttribute(alt)}" loading="lazy" class="chat-inline-image" />`;
  });

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, href: string) => {
    const normalizedHref = normalizeChatHref(href);
    if (!normalizedHref) return `${text}`;
    return `<a href="${escapeChatHtmlAttribute(normalizedHref)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // Bold: **text** or __text__
  result = result.replace(
    /\*\*(.+?)\*\*|__(.+?)__/g,
    (_match, g1: string, g2: string) => `<strong>${g1 ?? g2}</strong>`,
  );

  // Italic: *text* or _text_
  result = result.replace(
    /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g,
    (_match, g1: string, g2: string) => `<em>${g1 ?? g2}</em>`,
  );

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, (_match, code: string) => `<code>${code}</code>`);

  return result;
}

// ---------------------------------------------------------------------------
// Table detection
// ---------------------------------------------------------------------------

export function isChatMarkdownTableSeparator(line: string): boolean {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);
}

export function parseChatMarkdownTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

// ---------------------------------------------------------------------------
// List rendering
// ---------------------------------------------------------------------------

export function renderChatMarkdownList(
  lines: string[],
  startIndex: number,
  indentLength: number,
): { html: string; endIndex: number } {
  const isOrdered = /^\s*\d+\.\s/.test(lines[startIndex]);
  const tag = isOrdered ? "ol" : "ul";
  let html = `<${tag}>`;
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const listMatch = /^(\s*)([-*+]|\d+\.)\s(.*)$/.exec(line);
    if (!listMatch) break;

    const currentIndent = listMatch[1].length;
    if (currentIndent < indentLength) break;

    if (currentIndent > indentLength) {
      const nested = renderChatMarkdownList(lines, i, currentIndent);
      html += nested.html;
      i = nested.endIndex;
      continue;
    }

    html += `<li>${renderChatMarkdownInline(listMatch[3])}</li>`;
    i += 1;
  }

  html += `</${tag}>`;
  return { html, endIndex: i };
}

// ---------------------------------------------------------------------------
// Full markdown → HTML
// ---------------------------------------------------------------------------

export function renderChatMarkdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // Skip closing ```
      const langAttr = lang ? ` class="language-${escapeChatHtmlAttribute(lang)}"` : "";
      htmlParts.push(`<pre><code${langAttr}>${escapeChatHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${renderChatMarkdownInline(headingMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // Table
    if (i + 1 < lines.length && line.includes("|") && isChatMarkdownTableSeparator(lines[i + 1])) {
      const headerCells = parseChatMarkdownTableRow(line);
      let tableHtml = "<table><thead><tr>";
      for (const cell of headerCells) {
        tableHtml += `<th>${renderChatMarkdownInline(cell)}</th>`;
      }
      tableHtml += "</tr></thead><tbody>";
      i += 2; // Skip header + separator
      while (i < lines.length && lines[i].includes("|")) {
        const cells = parseChatMarkdownTableRow(lines[i]);
        tableHtml += "<tr>";
        for (const cell of cells) {
          tableHtml += `<td>${renderChatMarkdownInline(cell)}</td>`;
        }
        tableHtml += "</tr>";
        i += 1;
      }
      tableHtml += "</tbody></table>";
      htmlParts.push(tableHtml);
      continue;
    }

    // List
    if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      const listResult = renderChatMarkdownList(lines, i, 0);
      htmlParts.push(listResult.html);
      i = listResult.endIndex;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      htmlParts.push("<hr>");
      i += 1;
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("#") &&
      !/^\s*([-*+]|\d+\.)\s/.test(lines[i]) &&
      !/^(---|\*\*\*|___)\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    htmlParts.push(`<p>${paraLines.map(renderChatMarkdownInline).join("<br>")}</p>`);
  }

  return htmlParts.join("\n");
}

// ---------------------------------------------------------------------------
// JSON block detection
// ---------------------------------------------------------------------------

export function detectChatJsonBlock(text: string): Record<string, unknown> | unknown[] | null {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown> | unknown[];
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Token formatting
// ---------------------------------------------------------------------------

export function formatChatTokensCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
