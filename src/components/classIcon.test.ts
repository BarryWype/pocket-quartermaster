import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Files allowed to show a class emoji on its own: the debug screen lists raw content. */
const EXEMPT = ['src/app/debug.tsx'];
/** How many lines around a class emoji its icon may be on: the same element, wrapped by the formatter. */
const NEAR_LINES = 3;

const CLASS_EMOJI = /heroClasses\[([^\]]+)\]\.emoji/g;

/** The lines (1-based) where a class emoji is used without the same class's icon nearby. */
export function classEmojiWithoutIcon(source: string): number[] {
  const lines = source.split('\n');
  const out: number[] = [];
  lines.forEach((line, i) => {
    for (const match of line.matchAll(CLASS_EMOJI)) {
      const icon = `heroClasses[${match[1]}].icon`;
      const near = lines.slice(Math.max(0, i - NEAR_LINES), i + NEAR_LINES + 1).join('\n');
      if (!near.includes(icon)) out.push(i + 1);
    }
  });
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

describe('a hero class shows its pixel-art icon, not just its emoji', () => {
  test('the check catches an emoji alone and passes an emoji with its icon', () => {
    expect(classEmojiWithoutIcon('{ emoji: heroClasses[hero.classId].emoji }')).toEqual([1]);
    expect(classEmojiWithoutIcon('<GameIcon emoji={heroClasses[hero.classId].emoji} icon={heroClasses[hero.classId].icon} size={20} />')).toEqual([]);
    expect(classEmojiWithoutIcon('emoji: heroClasses[w.classId].emoji,\nicon: heroClasses[w.classId].icon,')).toEqual([]);
    // Another class's icon doesn't count.
    expect(classEmojiWithoutIcon('emoji={heroClasses[a].emoji} icon={heroClasses[b].icon}')).toEqual([1]);
  });

  test('every .tsx file under src passes the class icon with the class emoji', () => {
    const root = process.cwd();
    const violations = tsxFiles(join(root, 'src'))
      .map((path) => relative(root, path))
      .filter((file) => !EXEMPT.includes(file))
      .flatMap((file) => classEmojiWithoutIcon(readFileSync(join(root, file), 'utf8')).map((line) => `${file}:${line}`));
    expect(violations).toEqual([]);
  });
});
