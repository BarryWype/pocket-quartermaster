import { familyStrip, levelMarks, tagsForLevel, threatNeeds } from './strip';

describe('the party family strip', () => {
  test('one chip per family the party has, with its count and level', () => {
    const chips = familyStrip({ faith: 4, wild: 1, rally: 6 });
    expect(chips.map((chip) => [chip.family, chip.count, chip.level])).toEqual([
      ['rally', 6, 3],
      ['faith', 4, 2],
      ['wild', 1, 0],
    ]);
  });

  test('ties keep the families order', () => {
    expect(familyStrip({ plunder: 2, faith: 2 }).map((chip) => chip.family)).toEqual(['faith', 'plunder']);
  });

  test('a family with no tags gets no chip unless a threat needs it', () => {
    expect(familyStrip({ faith: 0 })).toEqual([]);
  });

  test('the needed families come first, red until reached', () => {
    const chips = familyStrip({ rally: 6, faith: 1 }, threatNeeds([{ id: 'holy', level: 2 }, { id: 'traps', level: 1 }]));
    expect(chips.map((chip) => chip.family)).toEqual(['faith', 'cunning', 'rally']);
    expect(chips[0].need).toEqual({ count: 2, met: false });
    expect(chips[1]).toMatchObject({ count: 0, level: 0, need: { count: 1, met: false } });
    expect(chips[2].need).toBeNull();
    expect(familyStrip({ faith: 2 }, threatNeeds([{ id: 'holy', level: 2 }]))[0].need).toEqual({ count: 2, met: true });
  });

  test('a family needed twice keeps its highest level', () => {
    const chips = familyStrip({ wild: 2 }, [
      { family: 'wild', level: 1 },
      { family: 'wild', level: 3 },
    ]);
    expect(chips).toHaveLength(1);
    expect(chips[0].need).toEqual({ count: 3, met: false });
  });

  test('the threat scoring’s verdict wins over the count (class bonuses against a threat)', () => {
    expect(familyStrip({ faith: 1 }, [{ family: 'faith', level: 2, met: true }])[0].need).toEqual({ count: 2, met: true });
  });

  test('the next level and how many tags are missing', () => {
    expect(familyStrip({ faith: 1 })[0].next).toEqual({ level: 1, count: 2, short: 1 });
    expect(familyStrip({ faith: 2 })[0].next).toEqual({ level: 2, count: 4, short: 2 });
    expect(familyStrip({ faith: 5 })[0].next).toEqual({ level: 3, count: 6, short: 1 });
    expect(familyStrip({ faith: 7 })[0].next).toBeNull();
  });

  test('levels are reached at 2, 4 and 6 tags', () => {
    expect([1, 2, 3].map(tagsForLevel)).toEqual([2, 4, 6]);
  });
});

describe('the strip in tags', () => {
  test('a Holy 2 briefing needs 2 Faith, met once the party has 2', () => {
    const [chip] = familyStrip({ faith: 1 }, threatNeeds([{ id: 'holy', level: 2 }]));
    expect(chip.need).toEqual({ count: 2, met: false });
    expect(chip.next).toEqual({ level: 1, count: 2, short: 1 });
    expect(familyStrip({ faith: 2 }, threatNeeds([{ id: 'holy', level: 2 }]))[0].need).toEqual({ count: 2, met: true });
  });

  test('levels show as lit dots', () => {
    expect([0, 1, 2, 3].map(levelMarks)).toEqual(['○○○', '●○○', '●●○', '●●●']);
  });
});
