'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const markdownModule = import('../../ui/src/utils/markdown.js');

test('parseMarkdown handles empty, null, undefined, numeric, BOM, and CRLF inputs safely', async () => {
  const { parseMarkdown, inlinePlainText } = await markdownModule;

  assert.deepEqual(parseMarkdown(''), { frontmatter: [], headings: [], blocks: [] });
  assert.deepEqual(parseMarkdown('   \r\n\t \n '), { frontmatter: [], headings: [], blocks: [] });
  assert.deepEqual(parseMarkdown(null), { frontmatter: [], headings: [], blocks: [] });
  assert.deepEqual(parseMarkdown(undefined), { frontmatter: [], headings: [], blocks: [] });

  const coerced = parseMarkdown(42);
  assert.equal(coerced.blocks.length, 1);
  assert.equal(coerced.blocks[0].type, 'paragraph');
  assert.equal(inlinePlainText(coerced.blocks[0].inlines), '42');

  const crlf = parseMarkdown('\uFEFF# Title\r\n\r\nLine A  \r\nLine B\r\n');
  assert.equal(crlf.headings.length, 1);
  assert.equal(crlf.headings[0].text, 'Title');
  assert.equal(crlf.blocks[1].type, 'paragraph');
  assert.deepEqual(crlf.blocks[1].inlines, [
    { type: 'text', text: 'Line A' },
    { type: 'break' },
    { type: 'text', text: 'Line B' },
  ]);
});

test('parseMarkdown parses YAML frontmatter with JSON-quoted strings and never lets unclosed --- swallow body', async () => {
  const { parseMarkdown, inlinePlainText } = await markdownModule;

  const doc = parseMarkdown([
    '---',
    'schema: "token-monitor-report/v1"',
    'reportId: "weekly:2026-W47"',
    'singleQuoted: \'hello \'\'world\'\'\'',
    'totalTokens: 4285600',
    'knownCostUsd: 38.17',
    '---',
    '',
    '# Weekly Report',
  ].join('\n'));

  assert.deepEqual(doc.frontmatter, [
    { key: 'schema', value: 'token-monitor-report/v1' },
    { key: 'reportId', value: 'weekly:2026-W47' },
    { key: 'singleQuoted', value: "hello 'world'" },
    { key: 'totalTokens', value: '4285600' },
    { key: 'knownCostUsd', value: '38.17' },
  ]);
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0].type, 'heading');
  assert.equal(inlinePlainText(doc.blocks[0].inlines), 'Weekly Report');

  // Unclosed `---` must render as an hr + normal body, NOT swallow content
  const unclosed = parseMarkdown([
    '---',
    'schema: "token-monitor-report/v1"',
    '',
    '# Real Body Heading',
    '',
    'Visible paragraph.',
  ].join('\n'));
  assert.deepEqual(unclosed.frontmatter, []);
  assert.equal(unclosed.blocks[0].type, 'hr');
  assert.equal(unclosed.headings.length, 1);
  assert.equal(unclosed.headings[0].text, 'Real Body Heading');
  assert.ok(unclosed.blocks.some((b) => b.type === 'paragraph' && inlinePlainText(b.inlines) === 'Visible paragraph.'));

  // `---` wrapping non-key-value prose is two HRs, not frontmatter
  const twoHrs = parseMarkdown('---\n\n# Body\n\n---');
  assert.deepEqual(twoHrs.frontmatter, []);
  assert.equal(twoHrs.blocks[0].type, 'hr');
  assert.equal(twoHrs.blocks[1].type, 'heading');
  assert.equal(twoHrs.blocks[2].type, 'hr');
});

test('parseMarkdown parses H1-H6 headings with unique TOC slug IDs', async () => {
  const { parseMarkdown } = await markdownModule;

  const doc = parseMarkdown([
    '# 一级标题',
    '## 核心结论',
    '### 模型诊断',
    '#### 子项',
    '##### 五级',
    '###### 六级',
    '## 核心结论',
    '## 核心结论',
    '### `Code` & **Bold**',
  ].join('\n'));

  assert.equal(doc.headings.length, 9);
  assert.deepEqual(
    doc.headings.map((h) => [h.depth, h.text, h.id]),
    [
      [1, '一级标题', '一级标题'],
      [2, '核心结论', '核心结论'],
      [3, '模型诊断', '模型诊断'],
      [4, '子项', '子项'],
      [5, '五级', '五级'],
      [6, '六级', '六级'],
      [2, '核心结论', '核心结论-2'],
      [2, '核心结论', '核心结论-3'],
      [3, 'Code & Bold', 'code-bold'],
    ],
  );
  const uniqueIds = new Set(doc.headings.map((h) => h.id));
  assert.equal(uniqueIds.size, doc.headings.length);
});

test('parseMarkdown parses real DeepSeek AI report Markdown including bold currency and 5-column GFM tables', async () => {
  const { parseMarkdown, inlinePlainText } = await markdownModule;

  const deepseekReport = [
    '# 本周 AI 研发效能与成本洞察',
    '',
    '## 核心结论',
    '- 本周期总消耗 **19,713,760 tokens**，已知费用**$38.17**，缓存命中率达 **75.4%**。',
    '- 项目 `token_monitor_v1` 贡献了核心增量，异常检测标识为 `cache_hit_rate_pct`。',
    '',
    '## 项目与研发重点',
    '| 项目 | Tokens | 成本 | 占比 | 观察 |',
    '| :--- | :---: | ---: | ---: | --- |',
    '| token-monitor-android | 9,890,000 | $19.10 | 50.2% | 主力客户端 Claude 缓存命中率稳定 \\| 无异常 |',
    '| hub-telemetry | 6,072,000 | $11.83 | 30.8% | 新增 `daily_snapshots` 归因 |',
    '| gateway-core | 3,751,760 | $7.24 | 19.0% | _No warning signals_ |',
    '',
    '> **成本提示**：第三方额度 `$42.50` 充足，建议保持长上下文复用。',
    '',
    '## 效率与额度建议',
    '1. 保持 `claude-sonnet-4` 的高缓存命中策略',
    '2. 针对 `token_monitor_v1` 拆分长会话窗口',
  ].join('\n');

  const doc = parseMarkdown(deepseekReport);
  assert.deepEqual(
    doc.headings.map((h) => h.text),
    ['本周 AI 研发效能与成本洞察', '核心结论', '项目与研发重点', '效率与额度建议'],
  );

  // Verify **$38.17** adjacent to Chinese characters parses as strong
  const conclusionList = doc.blocks.find((b) => b.type === 'list');
  assert.equal(conclusionList?.type, 'list');
  const firstBulletInlines = conclusionList.items[0].inlines;
  const strongTexts = firstBulletInlines
    .filter((n) => n.type === 'strong')
    .map((n) => inlinePlainText(n.children));
  assert.deepEqual(strongTexts, ['19,713,760 tokens', '$38.17', '75.4%']);

  // Verify snake_case inside inline text is preserved even outside backticks
  const snakeDoc = parseMarkdown('Identifier token_monitor_v1 and my_metric_name stay intact while _No projects_ is italic.');
  assert.equal(snakeDoc.blocks[0].type, 'paragraph');
  assert.deepEqual(snakeDoc.blocks[0].inlines, [
    { type: 'text', text: 'Identifier token_monitor_v1 and my_metric_name stay intact while ' },
    { type: 'em', children: [{ type: 'text', text: 'No projects' }] },
    { type: 'text', text: ' is italic.' },
  ]);

  // Verify 5-column GFM table alignments and escaped pipe `\|`
  const table = doc.blocks.find((b) => b.type === 'table');
  assert.equal(table?.type, 'table');
  assert.deepEqual(table.alignments, ['left', 'center', 'right', 'right', 'left']);
  assert.equal(table.headers.length, 5);
  assert.equal(table.rows.length, 3);
  assert.equal(
    inlinePlainText(table.rows[0][4]),
    '主力客户端 Claude 缓存命中率稳定 | 无异常',
  );
  assert.deepEqual(table.rows[2][4], [
    { type: 'em', children: [{ type: 'text', text: 'No warning signals' }] },
  ]);

  // Verify blockquote + ordered list
  const quote = doc.blocks.find((b) => b.type === 'blockquote');
  assert.equal(quote?.type, 'blockquote');
  assert.equal(quote.blocks[0].type, 'paragraph');
  const ordered = doc.blocks.filter((b) => b.type === 'list')[1];
  assert.equal(ordered.type, 'list');
  assert.equal(ordered.ordered, true);
  assert.equal(ordered.start, 1);
  assert.equal(ordered.items.length, 2);
});

test('parseMarkdown handles GFM table edge cases: optional outer pipes, uneven columns, and backtick pipes', async () => {
  const { parseMarkdown, inlinePlainText } = await markdownModule;

  const md = [
    'Name | Expression | Notes',
    ':--- | :---: | ---:',
    'alpha | `a \\| b` | single',
    'beta | short',
    'gamma | two | three | extra-ignored',
  ].join('\n');

  const doc = parseMarkdown(md);
  assert.equal(doc.blocks.length, 1);
  const table = doc.blocks[0];
  assert.equal(table.type, 'table');
  assert.deepEqual(table.alignments, ['left', 'center', 'right']);
  assert.equal(table.headers.length, 3);
  assert.equal(table.rows.length, 3);

  // Row 0 preserves pipe inside inline code
  assert.deepEqual(table.rows[0][1], [{ type: 'code', text: 'a | b' }]);
  // Row 1 (2 cells) padded to 3 columns
  assert.equal(table.rows[1].length, 3);
  assert.deepEqual(table.rows[1][2], []);
  // Row 2 (4 cells) clamped to 3 columns
  assert.equal(table.rows[2].length, 3);
  assert.equal(inlinePlainText(table.rows[2][2]), 'three');
});

test('parseMarkdown handles inline bold, italic, bold+italic, strike, escapes, math stars, and links', async () => {
  const { parseMarkdown } = await markdownModule;

  const md = [
    '**bold** __also-bold__ *italic* _em_ ***both*** ~~old~~ `code` ``with ` tick``',
    '',
    'Math 2 * 3 * 4 and \\*escaped\\* and \\_not-em\\_ and **[Docs](https://example.com/a_(b) "Title")**',
  ].join('\n');

  const doc = parseMarkdown(md);
  assert.equal(doc.blocks.length, 2);

  const first = doc.blocks[0];
  assert.equal(first.type, 'paragraph');
  assert.ok(first.inlines.some((n) => n.type === 'strong' && n.children[0]?.text === 'bold'));
  assert.ok(first.inlines.some((n) => n.type === 'strong' && n.children[0]?.text === 'also-bold'));
  assert.ok(first.inlines.some((n) => n.type === 'em' && n.children[0]?.text === 'italic'));
  assert.ok(first.inlines.some((n) => n.type === 'em' && n.children[0]?.text === 'em'));
  assert.ok(
    first.inlines.some(
      (n) =>
        (n.type === 'em' && n.children[0]?.type === 'strong' && n.children[0].children[0]?.text === 'both') ||
        (n.type === 'strong' && n.children[0]?.type === 'em' && n.children[0].children[0]?.text === 'both'),
    ),
  );
  assert.ok(first.inlines.some((n) => n.type === 'strike' && n.children[0]?.text === 'old'));
  assert.ok(first.inlines.some((n) => n.type === 'code' && n.text === 'code'));
  assert.ok(first.inlines.some((n) => n.type === 'code' && n.text === 'with ` tick'));

  const second = doc.blocks[1];
  assert.equal(second.type, 'paragraph');
  assert.deepEqual(second.inlines[0], {
    type: 'text',
    text: 'Math 2 * 3 * 4 and *escaped* and _not-em_ and ',
  });
  assert.deepEqual(second.inlines[1], {
    type: 'strong',
    children: [
      {
        type: 'link',
        label: [{ type: 'text', text: 'Docs' }],
        href: 'https://example.com/a_(b)',
        safeHref: 'https://example.com/a_(b)',
      },
    ],
  });
});

test('parseMarkdown handles unordered/ordered/nested/task lists, blockquotes, and fenced code blocks', async () => {
  const { parseMarkdown, inlinePlainText } = await markdownModule;

  const md = [
    '* Bullet one',
    '+ Bullet two',
    '- [x] Completed check',
    '- [ ] Pending check',
    '  - Nested item',
    '    1) Deep ordered one',
    '    2) Deep ordered two',
    '',
    '3. Ordered start three',
    '4. Item with code:',
    '   ```json',
    '   {"ok": true}',
    '   ```',
    '',
    '~~~ts',
    'const x = "<script>alert(1)</script>";',
    '~~~',
    '',
    '> Outer quote',
    '> > Nested quote with **bold**',
  ].join('\n');

  const doc = parseMarkdown(md);
  const firstList = doc.blocks[0];
  assert.equal(firstList.type, 'list');
  assert.equal(firstList.ordered, false);
  assert.equal(firstList.items.length, 4);
  assert.equal(firstList.items[2].checked, true);
  assert.equal(inlinePlainText(firstList.items[2].inlines), 'Completed check');
  assert.equal(firstList.items[3].checked, false);
  assert.equal(firstList.items[3].children.length, 1);

  const nestedUl = firstList.items[3].children[0];
  assert.equal(nestedUl.type, 'list');
  assert.equal(nestedUl.ordered, false);
  assert.equal(nestedUl.items[0].children.length, 1);

  const deepOl = nestedUl.items[0].children[0];
  assert.equal(deepOl.type, 'list');
  assert.equal(deepOl.ordered, true);
  assert.equal(deepOl.start, 1);
  assert.deepEqual(
    deepOl.items.map((item) => inlinePlainText(item.inlines)),
    ['Deep ordered one', 'Deep ordered two'],
  );

  const secondList = doc.blocks[1];
  assert.equal(secondList.type, 'list');
  assert.equal(secondList.ordered, true);
  assert.equal(secondList.start, 3);
  assert.equal(secondList.items[1].children[0].type, 'code');
  assert.equal(secondList.items[1].children[0].lang, 'json');
  assert.match(secondList.items[1].children[0].text, /"ok": true/);

  const tildeCode = doc.blocks[2];
  assert.equal(tildeCode.type, 'code');
  assert.equal(tildeCode.lang, 'ts');
  assert.equal(tildeCode.text, 'const x = "<script>alert(1)</script>";');

  const quote = doc.blocks[3];
  assert.equal(quote.type, 'blockquote');
  assert.equal(quote.blocks[0].type, 'paragraph');
  assert.equal(quote.blocks[1].type, 'blockquote');

  // Non-1 numbered wrap inside a paragraph must not accidentally split into a list
  const yearWrap = parseMarkdown('Released in\n2026. Continues smoothly.');
  assert.equal(yearWrap.blocks.length, 1);
  assert.equal(yearWrap.blocks[0].type, 'paragraph');
});

test('parseMarkdown handles full upstream usageReport Markdown fixture with signals and empty-state italics', async () => {
  const { parseMarkdown, inlinePlainText } = await markdownModule;

  const upstreamReport = [
    '---',
    'schema: "token-monitor-report/v1"',
    'reportId: "daily:2026-11-16"',
    'granularity: "daily"',
    'periodKey: "2026-11-16"',
    'startDate: "2026-11-16"',
    'endDate: "2026-11-16"',
    'generatedAt: "2026-11-16T12:00:00Z"',
    'totalTokens: 4285600',
    'knownCostUsd: 16.42',
    'projectCount: 0',
    '---',
    '',
    '# Token Monitor Usage Report — 2026-11-16',
    '',
    'Report ID: `daily:2026-11-16` · Timezone: `Asia/Shanghai` · Devices: 2/3 active',
    '',
    '## Executive Summary',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    '| Total Tokens | 4,285,600 |',
    '| Known Cost (USD) | $16.42 |',
    '',
    '## Project Usage Analysis',
    '',
    '_No project attribution recorded for this period._',
    '',
    '## Automated Signals',
    '',
    '- **[WARNING] `unpriced-tokens-present`**: 42,000 tokens lack pricing.',
    '',
    '---',
  ].join('\n');

  const doc = parseMarkdown(upstreamReport);
  assert.equal(doc.frontmatter.length, 10);
  assert.equal(doc.frontmatter[0].value, 'token-monitor-report/v1');
  assert.deepEqual(
    doc.headings.map((h) => h.id),
    ['token-monitor-usage-report-2026-11-16', 'executive-summary', 'project-usage-analysis', 'automated-signals'],
  );

  const emptyItalicsPara = doc.blocks.find(
    (b) => b.type === 'paragraph' && b.inlines[0]?.type === 'em',
  );
  assert.ok(emptyItalicsPara);
  assert.equal(inlinePlainText(emptyItalicsPara.inlines), 'No project attribution recorded for this period.');

  const signalList = doc.blocks.find((b) => b.type === 'list');
  assert.equal(signalList?.type, 'list');
  assert.equal(signalList.items[0].inlines[0].type, 'strong');
  assert.equal(doc.blocks[doc.blocks.length - 1].type, 'hr');
});

test('parseMarkdown keeps raw HTML literal and rejects unsafe link protocols', async () => {
  const { parseMarkdown, inlinePlainText, sanitizeHref } = await markdownModule;

  const unsafe = [
    '# Weekly Report 2026-W47',
    '',
    'Raw html: <img id=unsafe-report> <script>alert(1)</script> <svg onload=alert(1)>',
    '',
    '[bad-js](javascript:alert(1)) [bad-tab](java\tscript:alert(1)) [bad-data](data:text/html,<script>1</script>) [bad-vbs](vbscript:msgbox(1)) [rel](/reports/1) [ok](https://hub.example.com/reports)',
  ].join('\n');

  const doc = parseMarkdown(unsafe);
  const htmlPara = doc.blocks[1];
  assert.equal(htmlPara.type, 'paragraph');
  assert.equal(
    inlinePlainText(htmlPara.inlines),
    'Raw html: <img id=unsafe-report> <script>alert(1)</script> <svg onload=alert(1)>',
  );
  assert.ok(htmlPara.inlines.every((node) => node.type === 'text'));

  const linksPara = doc.blocks[2];
  assert.equal(linksPara.type, 'paragraph');
  const links = linksPara.inlines.filter((n) => n.type === 'link');
  assert.equal(links.length, 6);
  assert.equal(links[0].safeHref, null);
  assert.equal(links[1].safeHref, null);
  assert.equal(links[2].safeHref, null);
  assert.equal(links[3].safeHref, null);
  assert.equal(links[4].safeHref, null);
  assert.equal(links[5].safeHref, 'https://hub.example.com/reports');

  assert.equal(sanitizeHref('http://192.168.1.10:17321/api/reports'), 'http://192.168.1.10:17321/api/reports');
  assert.equal(sanitizeHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(sanitizeHref('  '), null);
});

test('parseMarkdown terminates tables before list items, parses indented tables inside lists, and handles unclosed brackets/backticks linearly', async () => {
  const { parseMarkdown, inlinePlainText } = await markdownModule;

  // List item containing `|` right after a table (no blank line) must terminate the table
  const listAfterTable = parseMarkdown([
    '| Key | Value |',
    '| --- | --- |',
    '| foo | 10 |',
    '- Summary: A | B',
    '- Next item',
  ].join('\n'));
  assert.equal(listAfterTable.blocks.length, 2);
  assert.equal(listAfterTable.blocks[0].type, 'table');
  assert.equal(listAfterTable.blocks[0].rows.length, 1);
  assert.equal(listAfterTable.blocks[1].type, 'list');
  assert.equal(listAfterTable.blocks[1].items.length, 2);
  assert.equal(inlinePlainText(listAfterTable.blocks[1].items[0].inlines), 'Summary: A | B');

  // Indented table inside a list item parses as a nested table child block
  const nestedTable = parseMarkdown([
    '- Item with breakdown:',
    '  | Tool | Share |',
    '  | --- | ---: |',
    '  | Codex | 60% |',
    '  | Claude | 40% |',
  ].join('\n'));
  assert.equal(nestedTable.blocks.length, 1);
  assert.equal(nestedTable.blocks[0].type, 'list');
  assert.equal(nestedTable.blocks[0].items[0].children.length, 1);
  assert.equal(nestedTable.blocks[0].items[0].children[0].type, 'table');
  assert.equal(nestedTable.blocks[0].items[0].children[0].rows.length, 2);

  // Pathological unclosed `[` and backticks complete swiftly without O(N^2) blowup
  const start = Date.now();
  const pathological = `${'[unclosed '.repeat(3000)} ${'`tick '.repeat(3000)}`;
  const parsed = parseMarkdown(pathological);
  const elapsedMs = Date.now() - start;
  assert.equal(parsed.blocks.length, 1);
  assert.ok(elapsedMs < 1500, `Expected linear-time parse (<1500ms), got ${elapsedMs}ms`);
});

test('MarkdownRenderer preserves WebView CSP/XSS invariants without raw HTML injection or navigation', () => {
  const rendererPath = path.resolve(__dirname, '../../ui/src/components/MarkdownRenderer.tsx');
  const source = fs.readFileSync(rendererPath, 'utf8');

  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(source, /<img[\s>]/);
  assert.doesNotMatch(source, /<a[\s>]/);
  assert.doesNotMatch(source, /#080C12/);
  assert.match(source, /select-text/);
  assert.match(source, /overflow-x-auto rounded-2xl border border-\[var\(--tm-border-default\)\] bg-\[var\(--tm-bg-table\)\]/);
  assert.match(source, /min-w-\[140px\]/);
  assert.match(source, /start=\{block\.start !== 1 \? block\.start : undefined\}/);
});
