import { levelMarks, tagsForLevel } from './strip';

describe('family levels', () => {
  test('levels are reached at 2, 4 and 6 tags', () => {
    expect([1, 2, 3].map(tagsForLevel)).toEqual([2, 4, 6]);
  });

  test('levels show as lit dots', () => {
    expect([0, 1, 2, 3].map(levelMarks)).toEqual(['○○○', '●○○', '●●○', '●●●']);
  });
});
