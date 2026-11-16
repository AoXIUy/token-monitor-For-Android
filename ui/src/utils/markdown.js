// @ts-check

/**
 * Portable zero-dependency Markdown parser (GFM subset + YAML frontmatter)
 * for Token Monitor Android reports and AI analysis summaries.
 *
 * Security model:
 * - Never parses raw HTML into HTML AST nodes; raw HTML remains literal text.
 * - Link destinations only expose `safeHref` for `http:` and `https:` URLs.
 */

/**
 * @typedef {Object} MarkdownFrontmatterEntry
 * @property {string} key
 * @property {string} value
 */

/**
 * @typedef {1 | 2 | 3 | 4 | 5 | 6} MarkdownHeadingDepth
 */

/**
 * @typedef {Object} MarkdownHeadingSummary
 * @property {MarkdownHeadingDepth} depth
 * @property {string} id
 * @property {string} text
 */

/**
 * @typedef {'left' | 'center' | 'right'} MarkdownTableAlignment
 */

/**
 * @typedef {{ type: 'text', text: string }} MarkdownTextInline
 * @typedef {{ type: 'strong', children: MarkdownInline[] }} MarkdownStrongInline
 * @typedef {{ type: 'em', children: MarkdownInline[] }} MarkdownEmInline
 * @typedef {{ type: 'strike', children: MarkdownInline[] }} MarkdownStrikeInline
 * @typedef {{ type: 'code', text: string }} MarkdownCodeInline
 * @typedef {{ type: 'link', label: MarkdownInline[], href: string, safeHref: string | null }} MarkdownLinkInline
 * @typedef {{ type: 'break' }} MarkdownBreakInline
 * @typedef {MarkdownTextInline | MarkdownStrongInline | MarkdownEmInline | MarkdownStrikeInline | MarkdownCodeInline | MarkdownLinkInline | MarkdownBreakInline} MarkdownInline
 */

/**
 * @typedef {Object} MarkdownListItem
 * @property {boolean | null} checked
 * @property {MarkdownInline[]} inlines
 * @property {MarkdownBlock[]} children
 */

/**
 * @typedef {{ type: 'heading', depth: MarkdownHeadingDepth, id: string, inlines: MarkdownInline[] }} MarkdownHeadingBlock
 * @typedef {{ type: 'paragraph', inlines: MarkdownInline[] }} MarkdownParagraphBlock
 * @typedef {{ type: 'list', ordered: boolean, start: number, items: MarkdownListItem[] }} MarkdownListBlock
 * @typedef {{ type: 'table', headers: MarkdownInline[][], alignments: MarkdownTableAlignment[], rows: MarkdownInline[][][] }} MarkdownTableBlock
 * @typedef {{ type: 'blockquote', blocks: MarkdownBlock[] }} MarkdownBlockquoteBlock
 * @typedef {{ type: 'code', lang: string, text: string }} MarkdownCodeBlock
 * @typedef {{ type: 'hr' }} MarkdownHrBlock
 * @typedef {MarkdownHeadingBlock | MarkdownParagraphBlock | MarkdownListBlock | MarkdownTableBlock | MarkdownBlockquoteBlock | MarkdownCodeBlock | MarkdownHrBlock} MarkdownBlock
 */

/**
 * @typedef {Object} MarkdownDocument
 * @property {MarkdownFrontmatterEntry[]} frontmatter
 * @property {MarkdownHeadingSummary[]} headings
 * @property {MarkdownBlock[]} blocks
 */

const RE_HEADING = /^[ \t]{0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const RE_HR = /^[ \t]{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const RE_FENCE_OPEN = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;
const RE_BLOCKQUOTE = /^[ \t]{0,3}> ?(.*)$/;
const RE_LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*)|[ \t]*)$/;
const RE_TASK_CHECKBOX = /^\[([ xX])\](?:[ \t]+(.*)|[ \t]*)$/;
const RE_TABLE_DELIM_CELL = /^:?-{1,}:?$/;
const RE_FRONTMATTER_KV = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/;
const RE_ASCII_PUNCT = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/;
const RE_WORD_CHAR = /[\p{L}\p{N}]/u;
const RE_WHITESPACE = /\s/;
const RE_CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/;

/**
 * Normalize input to LF-delimited string.
 * @param {unknown} source
 * @returns {string}
 */
function normalizeSource(source) {
  if (source === null || source === undefined) return '';
  const text = typeof source === 'string' ? source : String(source);
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

/**
 * Allow only http: and https: URLs without control characters or obfuscated whitespace.
 * @param {unknown} rawHref
 * @returns {string | null}
 */
export function sanitizeHref(rawHref) {
  if (typeof rawHref !== 'string') return null;
  let trimmed = rawHref.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>') && trimmed.length >= 2) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (!trimmed || RE_CONTROL_OR_SPACE.test(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Unquote JSON-quoted or single-quoted YAML frontmatter scalars.
 * @param {string} rawValue
 * @returns {string}
 */
function unquoteYamlValue(rawValue) {
  const trimmed = rawValue.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed : String(parsed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

/**
 * Parse optional leading YAML frontmatter (`---` ... `---`).
 * Unclosed or non-key-value blocks never swallow the document body.
 * @param {string[]} lines
 * @returns {{ frontmatter: MarkdownFrontmatterEntry[], bodyStart: number }}
 */
function extractFrontmatter(lines) {
  if (lines.length === 0 || !/^---\s*$/.test(lines[0])) {
    return { frontmatter: [], bodyStart: 0 };
  }

  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---\s*$/.test(lines[i])) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) {
    return { frontmatter: [], bodyStart: 0 };
  }

  /** @type {MarkdownFrontmatterEntry[]} */
  const entries = [];
  for (let i = 1; i < closeIndex; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = RE_FRONTMATTER_KV.exec(line);
    if (!match) {
      return { frontmatter: [], bodyStart: 0 };
    }
    entries.push({
      key: match[1],
      value: unquoteYamlValue(match[2]),
    });
  }

  if (entries.length === 0) {
    return { frontmatter: [], bodyStart: 0 };
  }

  return { frontmatter: entries, bodyStart: closeIndex + 1 };
}

/**
 * Extract plain readable text from inline AST nodes.
 * @param {MarkdownInline[]} inlines
 * @returns {string}
 */
export function inlinePlainText(inlines) {
  let out = '';
  for (const node of inlines) {
    if (node.type === 'text' || node.type === 'code') {
      out += node.text;
    } else if (node.type === 'break') {
      out += ' ';
    } else if (node.type === 'link') {
      out += inlinePlainText(node.label);
    } else {
      out += inlinePlainText(node.children);
    }
  }
  return out;
}

/**
 * Create a URL/HTML-friendly slug preserving Unicode letters and digits.
 * @param {string} text
 * @returns {string}
 */
export function slugifyHeading(text) {
  const normalized = String(text || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'section';
}

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isWordChar(ch) {
  return ch !== '' && RE_WORD_CHAR.test(ch);
}

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isSpaceChar(ch) {
  return ch === '' || RE_WHITESPACE.test(ch);
}

/**
 * @param {string} text
 * @param {number} openIndex Index of `[`
 * @returns {{ labelEnd: number, href: string, endIndex: number } | null}
 */
function tryReadLink(text, openIndex) {
  let depth = 1;
  let i = openIndex + 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (ch === '`') {
      let tickLen = 1;
      while (text[i + tickLen] === '`') tickLen += 1;
      const closeTick = findClosingBackticks(text, i + tickLen, tickLen);
      if (closeTick !== -1) {
        i = closeTick + tickLen;
        continue;
      }
      i += tickLen;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') depth -= 1;
    i += 1;
  }

  if (depth !== 0) return null;
  const labelEnd = i - 1;
  if (text[i] !== '(') return null;

  let parenDepth = 1;
  let j = i + 1;
  let inSingle = false;
  let inDouble = false;
  while (j < text.length && parenDepth > 0) {
    const ch = text[j];
    if (ch === '\\' && j + 1 < text.length) {
      j += 2;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    } else if (!inDouble && ch === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && !inDouble) {
      if (ch === '(') parenDepth += 1;
      else if (ch === ')') parenDepth -= 1;
    }
    j += 1;
  }

  if (parenDepth !== 0) return null;
  const rawDest = text.slice(i + 1, j - 1).trim();
  const href = stripOptionalLinkTitle(rawDest);
  return { labelEnd, href, endIndex: j };
}

/**
 * Strip optional `"title"` or `'title'` suffix from link destination.
 * @param {string} rawDest
 * @returns {string}
 */
function stripOptionalLinkTitle(rawDest) {
  if (!rawDest) return '';
  if (rawDest.startsWith('<')) {
    const closeAngle = rawDest.indexOf('>');
    if (closeAngle > 0) {
      return rawDest.slice(1, closeAngle).trim();
    }
  }
  const titleMatch = /^(.*?)\s+(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*')$/.exec(rawDest);
  return (titleMatch ? titleMatch[1] : rawDest).trim();
}

/**
 * Find matching closing backtick run of exact `tickLen`.
 * @param {string} text
 * @param {number} from
 * @param {number} tickLen
 * @returns {number}
 */
function findClosingBackticks(text, from, tickLen) {
  let i = from;
  while (i < text.length) {
    if (text[i] === '`') {
      let run = 1;
      while (text[i + run] === '`') run += 1;
      if (run === tickLen) return i;
      i += run;
    } else {
      i += 1;
    }
  }
  return -1;
}

/**
 * Try reading `<http://...>` or `<https://...>` autolink.
 * Raw HTML tags like `<img id=unsafe-report>` intentionally return null.
 * @param {string} text
 * @param {number} openIndex
 * @returns {{ href: string, endIndex: number } | null}
 */
function tryReadHttpAutolink(text, openIndex) {
  const closeIndex = text.indexOf('>', openIndex + 1);
  if (closeIndex === -1) return null;
  const inner = text.slice(openIndex + 1, closeIndex);
  if (RE_WHITESPACE.test(inner) || inner.includes('<')) return null;
  const lower = inner.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return null;
  const safe = sanitizeHref(inner);
  if (!safe) return null;
  return { href: inner, endIndex: closeIndex + 1 };
}

/**
 * @typedef {Object} InlineDelimToken
 * @property {'delim'} kind
 * @property {'*' | '_' | '~'} marker
 * @property {number} count
 * @property {number} origCount
 * @property {boolean} canOpen
 * @property {boolean} canClose
 */

/**
 * @typedef {{ kind: 'node', node: MarkdownInline }} InlineNodeToken
 * @typedef {InlineNodeToken | InlineDelimToken} InlineToken
 */

/**
 * Push plain text token, coalescing adjacent text tokens.
 * @param {InlineToken[]} tokens
 * @param {string} text
 */
function pushTextToken(tokens, text) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === 'node' && last.node.type === 'text') {
    last.node.text += text;
  } else {
    tokens.push({ kind: 'node', node: { type: 'text', text } });
  }
}

/**
 * Coalesce adjacent text nodes in a final MarkdownInline[] list.
 * @param {MarkdownInline[]} nodes
 * @returns {MarkdownInline[]}
 */
function coalesceInlineNodes(nodes) {
  /** @type {MarkdownInline[]} */
  const out = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (node.type === 'text' && prev && prev.type === 'text') {
      prev.text += node.text;
    } else {
      out.push(node);
    }
  }
  return out;
}

/**
 * Resolve delimiter tokens (`*`, `_`, `~~`) into `strong`, `em`, `strike` nodes.
 * @param {InlineToken[]} tokens
 * @returns {MarkdownInline[]}
 */
function resolveEmphasisTokens(tokens) {
  /** @type {InlineToken[]} */
  const work = tokens.slice();

  for (let closerIdx = 0; closerIdx < work.length; closerIdx += 1) {
    const closer = work[closerIdx];
    if (!closer || closer.kind !== 'delim' || !closer.canClose || closer.count <= 0) {
      continue;
    }

    while (closer.count > 0) {
      let openerIdx = -1;
      for (let j = closerIdx - 1; j >= 0; j -= 1) {
        const candidate = work[j];
        if (
          candidate &&
          candidate.kind === 'delim' &&
          candidate.canOpen &&
          candidate.count > 0 &&
          candidate.marker === closer.marker
        ) {
          // CommonMark rule: avoid intraword sum-of-3 ambiguity when lengths differ unless exact
          if (
            (candidate.canClose || closer.canOpen) &&
            (candidate.origCount + closer.origCount) % 3 === 0 &&
            (candidate.origCount % 3 !== 0 || closer.origCount % 3 !== 0)
          ) {
            continue;
          }
          openerIdx = j;
          break;
        }
      }

      if (openerIdx === -1) break;
      const opener = /** @type {InlineDelimToken} */ (work[openerIdx]);

      /** @type {number} */
      let useCount;
      if (closer.marker === '~') {
        if (opener.count < 2 || closer.count < 2) break;
        useCount = 2;
      } else {
        useCount = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
      }

      opener.count -= useCount;
      closer.count -= useCount;

      /** @type {MarkdownInline[]} */
      const innerNodes = [];
      for (let k = openerIdx + 1; k < closerIdx; k += 1) {
        const innerTok = work[k];
        if (!innerTok) continue;
        if (innerTok.kind === 'node') {
          innerNodes.push(innerTok.node);
        } else if (innerTok.count > 0) {
          innerNodes.push({ type: 'text', text: innerTok.marker.repeat(innerTok.count) });
        }
      }

      const wrappedChildren = coalesceInlineNodes(innerNodes);
      /** @type {MarkdownInline} */
      const wrappedNode =
        closer.marker === '~'
          ? { type: 'strike', children: wrappedChildren }
          : useCount === 2
            ? { type: 'strong', children: wrappedChildren }
            : { type: 'em', children: wrappedChildren };

      // Remove consumed inner tokens and place wrappedNode right before closer
      const deleteCount = closerIdx - openerIdx - 1;
      work.splice(openerIdx + 1, deleteCount, { kind: 'node', node: wrappedNode });
      closerIdx = openerIdx + 2;
    }
  }

  /** @type {MarkdownInline[]} */
  const result = [];
  for (const tok of work) {
    if (tok.kind === 'node') {
      result.push(tok.node);
    } else if (tok.count > 0) {
      result.push({ type: 'text', text: tok.marker.repeat(tok.count) });
    }
  }
  return coalesceInlineNodes(result);
}

/**
 * Parse inline Markdown syntax into AST nodes.
 * @param {string} rawText
 * @param {boolean} [allowLinks]
 * @returns {MarkdownInline[]}
 */
export function parseInlines(rawText, allowLinks = true) {
  if (!rawText) return [];
  /** @type {InlineToken[]} */
  const tokens = [];
  let i = 0;
  const len = rawText.length;

  while (i < len) {
    const ch = rawText[i];

    // Hard line breaks & soft newlines
    if (ch === '\n') {
      const last = tokens[tokens.length - 1];
      if (last && last.kind === 'node' && last.node.type === 'text') {
        const trailingSpaces = / {2,}$/.exec(last.node.text);
        if (trailingSpaces) {
          last.node.text = last.node.text.slice(0, -trailingSpaces[0].length);
          if (!last.node.text) tokens.pop();
          tokens.push({ kind: 'node', node: { type: 'break' } });
          i += 1;
          continue;
        }
      }
      pushTextToken(tokens, ' ');
      i += 1;
      continue;
    }

    // Backslash escape or trailing backslash hard break
    if (ch === '\\' && i + 1 < len) {
      const next = rawText[i + 1];
      if (next === '\n') {
        tokens.push({ kind: 'node', node: { type: 'break' } });
        i += 2;
        continue;
      }
      if (RE_ASCII_PUNCT.test(next)) {
        pushTextToken(tokens, next);
        i += 2;
        continue;
      }
    }

    // Inline code span
    if (ch === '`') {
      let tickLen = 1;
      while (rawText[i + tickLen] === '`') tickLen += 1;
      const closePos = findClosingBackticks(rawText, i + tickLen, tickLen);
      if (closePos !== -1) {
        let code = rawText.slice(i + tickLen, closePos).replace(/\n/g, ' ');
        if (
          code.length >= 2 &&
          code.startsWith(' ') &&
          code.endsWith(' ') &&
          /[^ ]/.test(code)
        ) {
          code = code.slice(1, -1);
        }
        tokens.push({ kind: 'node', node: { type: 'code', text: code } });
        i = closePos + tickLen;
        continue;
      }
      pushTextToken(tokens, '`'.repeat(tickLen));
      i += tickLen;
      continue;
    }

    // Autolink `<https://...>` (never raw HTML)
    if (allowLinks && ch === '<') {
      const auto = tryReadHttpAutolink(rawText, i);
      if (auto) {
        tokens.push({
          kind: 'node',
          node: {
            type: 'link',
            label: [{ type: 'text', text: auto.href }],
            href: auto.href,
            safeHref: sanitizeHref(auto.href),
          },
        });
        i = auto.endIndex;
        continue;
      }
    }

    // Inline link `[label](href)`
    if (allowLinks && ch === '[') {
      const linkMatch = tryReadLink(rawText, i);
      if (linkMatch) {
        const labelSlice = rawText.slice(i + 1, linkMatch.labelEnd);
        tokens.push({
          kind: 'node',
          node: {
            type: 'link',
            label: parseInlines(labelSlice, false),
            href: linkMatch.href,
            safeHref: sanitizeHref(linkMatch.href),
          },
        });
        i = linkMatch.endIndex;
        continue;
      }
    }

    // Emphasis / Strong (`*`, `_`) and Strikethrough (`~~`)
    if (ch === '*' || ch === '_') {
      let run = 1;
      while (rawText[i + run] === ch) run += 1;
      const prev = i > 0 ? rawText[i - 1] : '';
      const next = i + run < len ? rawText[i + run] : '';

      let canOpen = !isSpaceChar(next);
      let canClose = !isSpaceChar(prev);
      if (ch === '_') {
        // Avoid splitting snake_case identifiers inside words (e.g. token_monitor_v1)
        if (isWordChar(prev)) canOpen = false;
        if (isWordChar(next)) canClose = false;
      }

      if (canOpen || canClose) {
        tokens.push({
          kind: 'delim',
          marker: ch,
          count: run,
          origCount: run,
          canOpen,
          canClose,
        });
      } else {
        pushTextToken(tokens, ch.repeat(run));
      }
      i += run;
      continue;
    }

    if (ch === '~' && rawText[i + 1] === '~') {
      let run = 2;
      while (rawText[i + run] === '~') run += 1;
      if (run === 2) {
        const prev = i > 0 ? rawText[i - 1] : '';
        const next = i + 2 < len ? rawText[i + 2] : '';
        const canOpen = !isSpaceChar(next);
        const canClose = !isSpaceChar(prev);
        if (canOpen || canClose) {
          tokens.push({
            kind: 'delim',
            marker: '~',
            count: 2,
            origCount: 2,
            canOpen,
            canClose,
          });
        } else {
          pushTextToken(tokens, '~~');
        }
      } else {
        pushTextToken(tokens, '~'.repeat(run));
      }
      i += run;
      continue;
    }

    pushTextToken(tokens, ch);
    i += 1;
  }

  return resolveEmphasisTokens(tokens);
}

/**
 * Split a GFM table row into trimmed cell strings, preserving escaped pipes `\|`
 * and pipes inside closed inline backtick spans.
 * @param {string} line
 * @returns {string[]}
 */
function splitTableRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) {
    text = text.slice(1);
  }
  if (text.endsWith('|')) {
    let backslashes = 0;
    for (let k = text.length - 2; k >= 0 && text[k] === '\\'; k -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) {
      text = text.slice(0, -1);
    }
  }

  /** @type {string[]} */
  const cells = [];
  let current = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === '|') {
        current += '|';
        i += 2;
        continue;
      }
      if (next === '\\') {
        current += '\\\\';
        i += 2;
        continue;
      }
    }

    if (ch === '`') {
      let tickLen = 1;
      while (text[i + tickLen] === '`') tickLen += 1;
      const closePos = findClosingBackticks(text, i + tickLen, tickLen);
      if (closePos !== -1) {
        const rawSpan = text.slice(i, closePos + tickLen).replace(/\\\|/g, '|');
        current += rawSpan;
        i = closePos + tickLen;
        continue;
      }
      current += '`'.repeat(tickLen);
      i += tickLen;
      continue;
    }

    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  cells.push(current.trim());
  return cells;
}

/**
 * Check whether a line contains at least one unescaped `|` character.
 * @param {string} line
 * @returns {boolean}
 */
function hasUnescapedPipe(line) {
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\') {
      i += 1;
      continue;
    }
    if (line[i] === '|') return true;
  }
  return false;
}

/**
 * Try parsing a GFM pipe table starting at `startIndex`.
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {{ block: MarkdownTableBlock, nextIndex: number } | null}
 */
function tryParseTable(lines, startIndex) {
  if (startIndex + 1 >= lines.length) return null;
  const headerLine = lines[startIndex];
  const delimLine = lines[startIndex + 1];
  if (!headerLine.trim() || !delimLine.trim()) return null;
  if (!hasUnescapedPipe(headerLine) || !hasUnescapedPipe(delimLine)) return null;

  const headerCells = splitTableRow(headerLine);
  const delimCells = splitTableRow(delimLine);
  if (headerCells.length === 0 || headerCells.length !== delimCells.length) {
    return null;
  }

  /** @type {MarkdownTableAlignment[]} */
  const alignments = [];
  for (const cell of delimCells) {
    if (!RE_TABLE_DELIM_CELL.test(cell)) {
      return null;
    }
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    alignments.push(left && right ? 'center' : right ? 'right' : 'left');
  }

  const colCount = headerCells.length;
  const headers = headerCells.map((cell) => parseInlines(cell));
  /** @type {MarkdownInline[][][]} */
  const rows = [];

  let i = startIndex + 2;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || !hasUnescapedPipe(line)) break;
    if (
      RE_HEADING.test(line) ||
      RE_HR.test(line) ||
      RE_FENCE_OPEN.test(line) ||
      RE_BLOCKQUOTE.test(line)
    ) {
      break;
    }
    const rawCells = splitTableRow(line);
    /** @type {MarkdownInline[][]} */
    const normalizedRow = [];
    for (let col = 0; col < colCount; col += 1) {
      normalizedRow.push(col < rawCells.length && rawCells[col] ? parseInlines(rawCells[col]) : []);
    }
    rows.push(normalizedRow);
    i += 1;
  }

  return {
    block: {
      type: 'table',
      headers,
      alignments,
      rows,
    },
    nextIndex: i,
  };
}

/**
 * Measure leading indentation width (tabs count as 2 spaces for consistent nesting).
 * @param {string} ws
 * @returns {number}
 */
function measureIndent(ws) {
  let width = 0;
  for (let i = 0; i < ws.length; i += 1) {
    width += ws[i] === '\t' ? 2 : 1;
  }
  return width;
}

/**
 * Strip up to `columns` columns of leading indentation from a line.
 * @param {string} line
 * @param {number} columns
 * @returns {string}
 */
function dedentLine(line, columns) {
  let i = 0;
  let removed = 0;
  while (i < line.length && removed < columns) {
    if (line[i] === ' ') {
      removed += 1;
      i += 1;
    } else if (line[i] === '\t') {
      removed += 2;
      i += 1;
    } else {
      break;
    }
  }
  return line.slice(i);
}

/**
 * @param {string} line
 * @returns {{ indent: number, ordered: boolean, start: number, text: string } | null}
 */
function matchListItem(line) {
  if (RE_HR.test(line)) return null;
  const match = RE_LIST_ITEM.exec(line);
  if (!match) return null;
  const indent = measureIndent(match[1]);
  const marker = match[2];
  const ordered = /\d/.test(marker[0]);
  const start = ordered ? Number.parseInt(marker.slice(0, -1), 10) : 1;
  return {
    indent,
    ordered,
    start: Number.isFinite(start) && start >= 0 ? start : 1,
    text: match[3] || '',
  };
}

/**
 * Check if line starts a block element other than a plain paragraph.
 * @param {string[]} lines
 * @param {number} index
 * @returns {boolean}
 */
function startsBlockInterrupt(lines, index) {
  const line = lines[index];
  if (!line.trim()) return true;
  if (RE_HEADING.test(line)) return true;
  if (RE_HR.test(line)) return true;
  if (RE_FENCE_OPEN.test(line)) return true;
  if (RE_BLOCKQUOTE.test(line)) return true;
  const listItem = matchListItem(line);
  if (listItem && (!listItem.ordered || listItem.start === 1)) return true;
  if (tryParseTable(lines, index)) return true;
  return false;
}

/**
 * Parse a list starting at `startIndex` and `baseIndent`.
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {{ headings: MarkdownHeadingSummary[], usedIds: Set<string> }} ctx
 * @returns {{ block: MarkdownListBlock, nextIndex: number }}
 */
function parseList(lines, startIndex, ctx) {
  const first = /** @type {NonNullable<ReturnType<typeof matchListItem>>} */ (matchListItem(lines[startIndex]));
  const baseIndent = first.indent;
  const ordered = first.ordered;
  const start = first.start;
  /** @type {MarkdownListItem[]} */
  const items = [];
  let i = startIndex;

  while (i < lines.length) {
    const itemHead = matchListItem(lines[i]);
    if (!itemHead || itemHead.indent !== baseIndent || itemHead.ordered !== ordered) {
      break;
    }

    /** @type {boolean | null} */
    let checked = null;
    let firstLineText = itemHead.text;
    const taskMatch = RE_TASK_CHECKBOX.exec(firstLineText);
    if (taskMatch) {
      checked = taskMatch[1].toLowerCase() === 'x';
      firstLineText = taskMatch[2] || '';
    }

    /** @type {string[]} */
    const textLines = [firstLineText];
    /** @type {string[]} */
    const nestedLines = [];
    i += 1;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        // Look ahead past blank lines to see if the list continues or nested blocks continue
        let lookahead = i + 1;
        while (lookahead < lines.length && !lines[lookahead].trim()) {
          lookahead += 1;
        }
        if (lookahead >= lines.length) {
          i = lookahead;
          break;
        }
        const nextList = matchListItem(lines[lookahead]);
        if (nextList && nextList.indent === baseIndent && nextList.ordered === ordered) {
          i = lookahead;
          break;
        }
        const nextIndent = measureIndent((/^[ \t]*/.exec(lines[lookahead]) || [''])[0]);
        if (nextIndent > baseIndent) {
          nestedLines.push('');
          i += 1;
          continue;
        }
        i = lookahead;
        break;
      }

      const nextList = matchListItem(line);
      if (nextList) {
        if (nextList.indent <= baseIndent) {
          break;
        }
        // Nested indented list -> collect indented lines for nested block parsing
        while (i < lines.length) {
          const cur = lines[i];
          if (!cur.trim()) {
            let lookahead = i + 1;
            while (lookahead < lines.length && !lines[lookahead].trim()) {
              lookahead += 1;
            }
            if (lookahead >= lines.length) break;
            const laIndent = measureIndent((/^[ \t]*/.exec(lines[lookahead]) || [''])[0]);
            if (laIndent <= baseIndent) break;
            nestedLines.push('');
            i += 1;
            continue;
          }
          const curIndent = measureIndent((/^[ \t]*/.exec(cur) || [''])[0]);
          if (curIndent <= baseIndent) break;
          nestedLines.push(dedentLine(cur, baseIndent + 2));
          i += 1;
        }
        continue;
      }

      const indent = measureIndent((/^[ \t]*/.exec(line) || [''])[0]);
      if (indent > baseIndent) {
        const dedented = dedentLine(line, baseIndent + 2);
        if (
          nestedLines.length > 0 ||
          RE_FENCE_OPEN.test(dedented) ||
          RE_BLOCKQUOTE.test(dedented) ||
          RE_HEADING.test(dedented) ||
          RE_HR.test(dedented)
        ) {
          nestedLines.push(dedented);
        } else {
          textLines.push(line.trim());
        }
        i += 1;
        continue;
      }

      // Non-indented line interrupts list if it starts another block
      if (startsBlockInterrupt(lines, i)) {
        break;
      }
      textLines.push(line.trim());
      i += 1;
    }

    const inlines = parseInlines(textLines.join('\n').trim());
    const children = nestedLines.length > 0 ? parseBlocks(nestedLines, ctx) : [];
    items.push({ checked, inlines, children });
  }

  return {
    block: {
      type: 'list',
      ordered,
      start,
      items,
    },
    nextIndex: i,
  };
}

/**
 * Parse lines into block AST nodes.
 * @param {string[]} lines
 * @param {{ headings: MarkdownHeadingSummary[], usedIds: Set<string> }} ctx
 * @returns {MarkdownBlock[]}
 */
function parseBlocks(lines, ctx) {
  /** @type {MarkdownBlock[]} */
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code block (``` or ~~~)
    const fenceMatch = RE_FENCE_OPEN.exec(line);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const fenceChar = fence[0];
      const fenceLen = fence.length;
      const rawInfo = fenceMatch[2] || '';
      if (fenceChar === '`' && rawInfo.includes('`')) {
        // CommonMark: backtick fence info strings cannot contain backticks; fall through to paragraph
      } else {
        const lang = rawInfo.trim().split(/\s+/)[0] || '';
        /** @type {string[]} */
        const codeLines = [];
        i += 1;
        while (i < lines.length) {
          const closeMatch = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[i]);
          if (
            closeMatch &&
            closeMatch[1][0] === fenceChar &&
            closeMatch[1].length >= fenceLen
          ) {
            i += 1;
            break;
          }
          codeLines.push(lines[i]);
          i += 1;
        }
        blocks.push({
          type: 'code',
          lang,
          text: codeLines.join('\n'),
        });
        continue;
      }
    }

    // Horizontal rule (check before list so `* * *` / `- - -` becomes hr)
    if (RE_HR.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // ATX Heading (`#` .. `######`)
    const headingMatch = RE_HEADING.exec(line);
    if (headingMatch) {
      const depth = /** @type {MarkdownHeadingDepth} */ (headingMatch[1].length);
      const rawHeading = (headingMatch[2] || '').replace(/[ \t]+#+[ \t]*$/, '').trim();
      const inlines = parseInlines(rawHeading);
      const plainText = inlinePlainText(inlines).trim();
      const baseSlug = slugifyHeading(plainText);
      let uniqueId = baseSlug;
      let suffix = 2;
      while (ctx.usedIds.has(uniqueId)) {
        uniqueId = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      ctx.usedIds.add(uniqueId);
      ctx.headings.push({ depth, id: uniqueId, text: plainText });
      blocks.push({
        type: 'heading',
        depth,
        id: uniqueId,
        inlines,
      });
      i += 1;
      continue;
    }

    // Blockquote (`> ...`)
    if (RE_BLOCKQUOTE.test(line)) {
      /** @type {string[]} */
      const quoteLines = [];
      while (i < lines.length) {
        const qm = RE_BLOCKQUOTE.exec(lines[i]);
        if (!qm) break;
        quoteLines.push(qm[1]);
        i += 1;
      }
      blocks.push({
        type: 'blockquote',
        blocks: parseBlocks(quoteLines, ctx),
      });
      continue;
    }

    // GFM Pipe Table
    const tableResult = tryParseTable(lines, i);
    if (tableResult) {
      blocks.push(tableResult.block);
      i = tableResult.nextIndex;
      continue;
    }

    // Ordered / Unordered / Task List
    if (matchListItem(line)) {
      const listResult = parseList(lines, i, ctx);
      blocks.push(listResult.block);
      i = listResult.nextIndex;
      continue;
    }

    // Paragraph (consume consecutive non-interrupting lines)
    /** @type {string[]} */
    const paraLines = [line];
    i += 1;
    while (i < lines.length && !startsBlockInterrupt(lines, i)) {
      paraLines.push(lines[i]);
      i += 1;
    }
    const paraText = paraLines.map((l) => l.replace(/^[ \t]+/, '')).join('\n');
    blocks.push({
      type: 'paragraph',
      inlines: parseInlines(paraText),
    });
  }

  return blocks;
}

/**
 * Parse Markdown text into frontmatter metadata, TOC heading summaries, and block/inline AST.
 * @param {unknown} source
 * @returns {MarkdownDocument}
 */
export function parseMarkdown(source) {
  const normalized = normalizeSource(source);
  if (!normalized.trim()) {
    return { frontmatter: [], headings: [], blocks: [] };
  }

  const lines = normalized.split('\n');
  const { frontmatter, bodyStart } = extractFrontmatter(lines);
  const bodyLines = lines.slice(bodyStart);

  /** @type {{ headings: MarkdownHeadingSummary[], usedIds: Set<string> }} */
  const ctx = {
    headings: [],
    usedIds: new Set(),
  };
  const blocks = parseBlocks(bodyLines, ctx);

  return {
    frontmatter,
    headings: ctx.headings,
    blocks,
  };
}
