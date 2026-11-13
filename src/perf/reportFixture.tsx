// The menu timing test's report screen: a finished expedition's card opened,
// its loot 30 tiles (see menuFirstOpen.test.tsx).

import { ReportCard } from '@/components/ReportCard';
import { items } from '@/content/items';
import { materials } from '@/content/materials';
import { relics } from '@/content/loot/relics';
import { recipes } from '@/content/recipes';
import { emptyLoot } from '@/game/loot/types';
import type { ExpeditionReport, Rarity } from '@/game/types';
import { useGameStore } from '@/store/gameStore';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/** One gold pile, 12 materials, 6 consumables, 8 gear pieces, 2 blueprints and a relic. */
export function thirtyTileReport(): ExpeditionReport {
  const gear = items.filter((i) => i.slot === 'weapon').slice(0, 8);
  return {
    id: 'perf',
    dungeonId: 'goblinWarren',
    heroIds: ['bram', 'lyra', 'mira'],
    startedAt: 0,
    finishedAt: 25 * 60_000,
    outcome: 'success',
    success: true,
    encountersCleared: 5,
    encounterCount: 5,
    heroHp: ['bram', 'lyra', 'mira'].map((heroId) => ({ heroId, hp: 30, maxHp: 40, before: 40 })),
    threats: [],
    opportunity: null,
    salvaged: [],
    loot: {
      ...emptyLoot(),
      gold: 120,
      xp: 40,
      materials: materials.slice(0, 12).map((m) => ({ materialId: m.id, amount: 3 })),
      consumables: items.filter((i) => i.slot === 'consumable').slice(0, 6).map((i) => ({ itemId: i.id, amount: 1 })),
      gear: gear.map((g, i) => ({ uid: `g${i}`, itemId: g.id, rarity: RARITIES[i % 4] })),
      recipeIds: recipes.slice(0, 2).map((r) => r.id),
      relics: [relics[0].id],
    },
    gold: 120,
    xp: 40,
    consumablesUsed: [],
    log: ['The party set out.'],
    seen: true,
  };
}

export default function ReportFixture() {
  const heroes = useGameStore((state) => state.save.heroes);
  return <ReportCard report={thirtyTileReport()} heroes={heroes} now={30 * 60_000} expanded onToggle={() => {}} />;
}
