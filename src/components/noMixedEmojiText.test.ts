import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Emoji the game font has no glyphs for: everything in the supplementary emoji
 * planes, plus the BMP symbol ranges that hold this game's emoji. Text dingbats
 * the font does draw (✓, ★) are left out so they do not count as emoji.
 */
const EMOJI_PATTERN =
  '[\uD83C-\uD83F][\uDC00-\uDFFF]|[\u2600-\u2604\u2607-\u2712\u2717-\u2725\u2728-\u27BF\u2B00-\u2BFF\u231A-\u23FF]\uFE0F?|\uFE0F';
/** Non-global for `.test`, global for replace and matchAll. */
const EMOJI_SOURCE = new RegExp(EMOJI_PATTERN);
const EMOJI_ANYWHERE = new RegExp(EMOJI_PATTERN, 'g');

/** A letter or digit in JSX text: content beyond the emoji. */
const WORDS = /[A-Za-z0-9À-ÿ]/;

/** Accesses and identifiers that carry an emoji: `item.emoji`, `emoji`, `pageEmoji`. */
const EMOJI_NAME_PATTERN = "[^\\s{}\",'`]*[Ee]moji[^\\s{}\",'`]*";
const EMOJI_NAME = new RegExp(EMOJI_NAME_PATTERN);
const EMOJI_NAME_ANYWHERE = new RegExp(EMOJI_NAME_PATTERN, 'g');

/** The explicit opt-out, with its reason: `// mixed-emoji-ok: wraps in a full-width paragraph`. */
const OPT_OUT = /mixed-emoji-ok:/;

/** Attrs whose string value lands in a single Text: Button's title, Sheet's title and subtitle, Choice's label. */
const TITLE_ATTRS = ['title', 'subtitle', 'label'];

type Violation = { file: string; line: number; excerpt: string };

/** The `>` that closes the tag opened at `start`, skipping strings and braces; -1 if none. */
function endOfTag(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') i = endOfString(source, i, c);
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

function endOfString(source: string, start: number, quote: string): number {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === quote) return i;
  }
  return source.length - 1;
}

/** Every `<Text>…</Text>` span, paired by nesting, with the offset of its opening tag. */
function textElements(source: string): { at: number; children: string }[] {
  const opens: number[] = [];
  const starts: number[] = [];
  const done: { at: number; children: string }[] = [];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('<Text', i) && !/[\w.]/.test(source[i + 5] ?? '')) {
      const tagEnd = endOfTag(source, i);
      if (tagEnd === -1 || source[tagEnd - 1] === '/') {
        i += 5;
        continue;
      }
      opens.push(i);
      starts.push(tagEnd + 1);
      i = tagEnd + 1;
    } else if (source.startsWith('</Text>', i)) {
      const at = opens.pop();
      const start = starts.pop();
      if (at !== undefined && start !== undefined) done.push({ at, children: source.slice(start, i) });
      i += 7;
    } else {
      i++;
    }
  }
  return done;
}

/** The values of a JSX expression attribute (`title={…}`), braces balanced. */
function attributeExpressions(source: string, name: string): { at: number; value: string }[] {
  const found: { at: number; value: string }[] = [];
  for (const match of source.matchAll(new RegExp(`\\b${name}=\\{`, 'g'))) {
    const start = match.index! + match[0].length - 1;
    let depth = 0;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (c === '"' || c === "'" || c === '`') i = endOfString(source, i, c);
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          found.push({ at: match.index!, value: source.slice(start + 1, i) });
          break;
        }
      }
    }
  }
  return found;
}

/** `// …` and `/* … *​/` comments, so commented-out code never counts. */
function stripComments(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    if (source.startsWith('//', i)) {
      while (i < source.length && source[i] !== '\n') i++;
      out += ' ';
    } else if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i);
      i = end === -1 ? source.length : end + 1;
      out += ' ';
    } else out += source[i];
  }
  return out;
}

/**
 * Does one `<Text>`'s children mix an emoji source with other content? An emoji
 * source is a `.emoji` access, an identifier naming one, or an emoji literal;
 * other content is any word in the JSX text or any further expression.
 */
export function mixesEmojiWithWords(children: string): boolean {
  const text = stripComments(children);
  if (!(EMOJI_SOURCE.test(text) || EMOJI_NAME.test(text))) return false;
  const bareWords = WORDS.test(text.replace(/\{[^{}]*\}/g, ' ').replace(EMOJI_ANYWHERE, ''));
  const otherExpression = [...text.matchAll(/\{([^{}]*)\}/g)].some(({ 1: expr }) => {
    const value = expr.trim();
    if (value === '') return false;
    if (EMOJI_SOURCE.test(value) || EMOJI_NAME.test(value)) return false;
    return /\W/.test(value) || WORDS.test(value);
  });
  return bareWords || otherExpression;
}

/** Does a title-bearing attribute's expression mix an emoji with words? */
export function titleMixesEmoji(value: string): boolean {
  if (!(EMOJI_SOURCE.test(value) || EMOJI_NAME.test(value))) return false;
  return WORDS.test(value.replace(EMOJI_ANYWHERE, '').replace(EMOJI_NAME_ANYWHERE, ''));
}

function scanFile(path: string, source: string): Violation[] {
  const lines = source.split('\n');
  const out: Violation[] = [];
  for (const { at, children } of textElements(source)) {
    if (OPT_OUT.test(children)) continue;
    const line = source.slice(0, at).split('\n').length;
    if (OPT_OUT.test(lines[line - 1] ?? '')) continue;
    if (mixesEmojiWithWords(children)) {
      out.push({ file: path, line, excerpt: children.replace(/\s+/g, ' ').trim().slice(0, 90) });
    }
  }
  for (const name of TITLE_ATTRS) {
    for (const { at, value } of attributeExpressions(source, name)) {
      if (!titleMixesEmoji(value)) continue;
      const line = source.slice(0, at).split('\n').length;
      if (OPT_OUT.test(lines[line - 1] ?? '')) continue;
      out.push({ file: path, line, excerpt: `${name}={${value.replace(/\s+/g, ' ').slice(0, 70)}}` });
    }
  }
  return out;
}

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

describe('no Text mixes an emoji with words', () => {
  test('an emoji source on its own is fine', () => {
    expect(mixesEmojiWithWords('{item.emoji}')).toBe(false);
    expect(mixesEmojiWithWords('{emoji}')).toBe(false);
    expect(mixesEmojiWithWords('⚔️')).toBe(false);
    expect(mixesEmojiWithWords('{tr(item.name)}')).toBe(false);
  });

  test('the pattern the forge tabs used is caught', () => {
    // The pre-fix ForgeStation tab: one emoji source plus one label expression.
    expect(mixesEmojiWithWords('\n  {PAGE_META[type].emoji} {PAGE_META[type].label()}\n')).toBe(true);
    expect(mixesEmojiWithWords('{item.emoji} {tr(item.name)}')).toBe(true);
    expect(mixesEmojiWithWords('⚔️ Attack')).toBe(true);
    expect(mixesEmojiWithWords("{opportunity.emoji}{' '}{t('secrets.vaultOptIn')}")).toBe(true);
    expect(titleMixesEmoji("t('health.use', { item: `${item.emoji} ${tr(item.name)}`, count })")).toBe(true);
  });

  test('every .tsx file under src keeps emoji and words in separate elements', () => {
    const violations: Violation[] = [];
    for (const path of tsxFiles(join(process.cwd(), 'src'))) {
      violations.push(...scanFile(path, readFileSync(path, 'utf8')));
    }
    expect(violations.map(({ file, line }) => `${file}:${line}`)).toEqual([]);
  });
});
