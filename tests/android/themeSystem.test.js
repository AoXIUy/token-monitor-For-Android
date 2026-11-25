'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const stateModule = import('../../ui/src/nativeState.js');

const EXPECTED_THEMES = {
  obsidian: { isLight: false, canvas: '#090C10' },
  daylight: { isLight: true, canvas: '#F4F6F9' },
  amber: { isLight: false, canvas: '#0D0B09' },
  emerald: { isLight: false, canvas: '#060E0C' },
  nebula: { isLight: false, canvas: '#090914' },
  frost: { isLight: true, canvas: '#EBF1F8' },
};

const REQUIRED_TOKENS = [
  '--tm-bg-canvas',
  '--tm-bg-surface',
  '--tm-bg-surface-elevated',
  '--tm-bg-inset',
  '--tm-bg-chrome',
  '--tm-bg-pill',
  '--tm-bg-dialog',
  '--tm-bg-hero',
  '--tm-border-subtle',
  '--tm-border-default',
  '--tm-border-strong',
  '--tm-border-accent',
  '--tm-text-primary',
  '--tm-text-secondary',
  '--tm-text-muted',
  '--tm-text-subtle',
  '--tm-text-inverse',
  '--tm-accent',
  '--tm-accent-text',
  '--tm-accent-secondary',
  '--tm-focus-ring',
  '--tm-nav-active-bg',
  '--tm-nav-active-text',
  '--tm-success',
  '--tm-warning',
  '--tm-danger',
  '--tm-info',
  '--tm-violet',
  '--tm-chart-grid',
  '--tm-chart-axis',
  '--tm-chart-primary',
  '--tm-chart-tooltip-bg',
];

function extractCssBlock(css, selectorPattern) {
  const match = css.match(selectorPattern);
  assert.ok(match, `Missing CSS block matching ${selectorPattern}`);
  const openBrace = css.indexOf('{', match.index);
  assert.ok(openBrace >= 0);
  let depth = 0;
  for (let i = openBrace; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(openBrace + 1, i);
    }
  }
  throw new Error(`Unterminated CSS block for ${selectorPattern}`);
}

test('theme allowlist, sanitization, polarity, and auto resolution stay consistent', async () => {
  const {
    THEME_IDS,
    THEME_PREFERENCES,
    DEFAULT_THEME_PREFERENCE,
    sanitizeThemePreference,
    resolveThemeId,
    isLightTheme,
  } = await stateModule;

  assert.equal(DEFAULT_THEME_PREFERENCE, 'obsidian');
  assert.deepEqual([...THEME_IDS], Object.keys(EXPECTED_THEMES));
  assert.deepEqual([...THEME_PREFERENCES], [...Object.keys(EXPECTED_THEMES), 'auto']);

  for (const [id, spec] of Object.entries(EXPECTED_THEMES)) {
    assert.equal(sanitizeThemePreference(id), id);
    assert.equal(sanitizeThemePreference(`  ${id.toUpperCase()}  `), id);
    assert.equal(resolveThemeId(id, true), id);
    assert.equal(resolveThemeId(id, false), id);
    assert.equal(isLightTheme(id), spec.isLight);
  }

  assert.equal(sanitizeThemePreference('auto'), 'auto');
  assert.equal(sanitizeThemePreference(' AUTO '), 'auto');
  assert.equal(resolveThemeId('auto', true), 'obsidian');
  assert.equal(resolveThemeId('auto', false), 'daylight');

  for (const invalid of [null, undefined, '', 'dark', 'light', 'midnight', 42, {}, []]) {
    assert.equal(sanitizeThemePreference(invalid), 'obsidian');
    assert.equal(resolveThemeId(invalid, false), 'obsidian');
  }

  // Verify themes.ts catalog defines all 6 presets with matching canvas hexes & polarity
  const themesTs = fs.readFileSync(path.join(ROOT, 'ui/src/utils/themes.ts'), 'utf8');
  for (const [id, spec] of Object.entries(EXPECTED_THEMES)) {
    assert.match(themesTs, new RegExp(`id:\\s*'${id}'`), `themes.ts missing catalog entry for ${id}`);
    assert.match(themesTs, new RegExp(`canvas:\\s*'${spec.canvas}'`, 'i'), `themes.ts canvas mismatch for ${id}`);
  }
  assert.match(themesTs, /dataset\.theme\s*=\s*resolvedId/);
  assert.match(themesTs, /dataset\.colorMode\s*=\s*colorMode/);
  assert.match(themesTs, /tm-color-scheme/);
});

test('index.css defines all 6 theme blocks, required tokens, literal ::backdrop rules, and WebView guards', () => {
  const css = fs.readFileSync(path.join(ROOT, 'ui/src/index.css'), 'utf8');

  for (const [id, spec] of Object.entries(EXPECTED_THEMES)) {
    const themeBlock = extractCssBlock(css, new RegExp(`:root\\[data-theme="${id}"\\]\\s*\\{`));
    const expectedScheme = spec.isLight ? 'light' : 'dark';
    assert.match(themeBlock, new RegExp(`color-scheme:\\s*${expectedScheme};`), `${id} must set color-scheme: ${expectedScheme}`);
    assert.match(
      themeBlock,
      new RegExp(`--tm-bg-canvas:\\s*${spec.canvas};`, 'i'),
      `${id} canvas hex must match native ThemePolicy`,
    );
    for (const token of REQUIRED_TOKENS) {
      assert.ok(themeBlock.includes(`${token}:`), `${id} is missing CSS token ${token}`);
    }

    const backdropBlock = extractCssBlock(
      css,
      new RegExp(`:root\\[data-theme="${id}"\\]\\s+\\.tm-dialog::backdrop\\s*\\{`),
    );
    assert.match(backdropBlock, /background:\s*rgba\(/, `${id} ::backdrop must define a literal rgba background`);
    assert.equal(backdropBlock.includes('var('), false, `${id} ::backdrop must not use var() (Chromium 111-121 bug)`);
  }

  // Zero-FOUC startup rule & search clear button guard
  assert.match(css, /html:not\(\[data-theme\]\)\s+body\s*\{[^}]*background-color:\s*transparent;/);
  assert.match(css, /::-webkit-search-cancel-button/);

  // No nested backdrop-filter on .glass-pill-bar (used inside .tm-chrome-bar)
  const pillBarBlock = extractCssBlock(css, /\.glass-pill-bar\s*\{/);
  assert.equal(pillBarBlock.includes('backdrop-filter'), false, '.glass-pill-bar must not apply nested backdrop-filter');

  // Polarity-aware client tone rules for light mode
  assert.match(css, /:root\[data-color-mode="light"\]\s+\.tm-tone-sky\s*\{/);
  assert.match(css, /:root\[data-color-mode="light"\]\s+\.tm-tone-emerald\s*\{/);
});

test('index.html preserves strict CSP and exposes #tm-color-scheme meta', () => {
  const html = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
  assert.match(html, /<meta\s+id="tm-color-scheme"\s+name="color-scheme"\s+content="dark">/);
  assert.match(html, /script-src 'self'/);
  assert.equal(/<script(?![^>]*\bsrc=)/i.test(html), false, 'index.html must not contain inline scripts under strict CSP');
});

test('nativeState accepts all 6 themes plus auto, ignores invalid themes, and tracks imeVisibility', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  let state = createInitialState();

  for (const pref of [...Object.keys(EXPECTED_THEMES), 'auto']) {
    state = receiveNativeMessage(state, { type: 'displayPrefs', theme: pref });
    assert.equal(state.displayPrefs.theme, pref);
  }

  state = receiveNativeMessage(state, { type: 'displayPrefs', theme: 'bogus', systemDark: false });
  assert.equal(state.displayPrefs.theme, 'auto');
  assert.equal(state.systemDark, false);

  state = receiveNativeMessage(state, { type: 'imeVisibility', visible: true });
  assert.equal(state.imeVisible, true);
  state = receiveNativeMessage(state, { type: 'imeVisibility', visible: false });
  assert.equal(state.imeVisible, false);
});
