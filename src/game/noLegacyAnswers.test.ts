import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Approaches, threat keywords and kits no longer answer threats: families do.
 * Only the save migration and its legacy tables may still name them.
 */
const LEGACY = [
  /\bapproach(es|Picks|Rules|Score|Bonus|Milestones|Chance|Points)?\b/,
  /\bApproach\w*/,
  /\b[kK]its?\b/,
  /\bKit[A-Z]\w*/,
  /\bcarried(Kit|By)\b/,
  /\b(calm|antidote|watchful)\b/,
  /\b(holyRelics|blessedRelics|roguesRoll|huntersPack|explorersKit|healersSatchel|giftBasket|scholarsSatchel|\w+WardSalve)\b/,
  /[tT]alisman/,
];

const ALLOWED = ['src/game/legacyThreats.ts', 'src/game/migrations.ts', 'src/game/noLegacyAnswers.test.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('no legacy threat answers', () => {
  it('leaves no approach, threat keyword or kit in the source', () => {
    const root = process.cwd();
    const hits = sourceFiles(join(root, 'src'))
      .map((path) => relative(root, path))
      .filter((file) => !ALLOWED.includes(file))
      .flatMap((file) =>
        readFileSync(join(root, file), 'utf8')
          .split('\n')
          .flatMap((line, i) => (LEGACY.some((pattern) => pattern.test(line)) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
      );
    expect(hits).toEqual([]);
  });
});
