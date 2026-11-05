import { jobById } from '@/content/jobs';
import { materialById } from '@/content/lookup';
import { workToolRules } from '@/content/workTools';
import type { GearDef } from '@/game/types';
import { jobMaterials } from '@/game/jobs/jobs';
import { formatPercent, t, tr } from '@/i18n';

import type { LabelPart } from './IconLabel';

/**
 * A work tool's item-card line, e.g. "Woodcutter: +10% output · Scavenge: 50%
 * chance of 1 wood per won fight" (weighted jobs list their materials). Empty for other gear.
 */
export function workToolParts(item: GearDef): LabelPart[] {
  if (!item.workTool) return [];
  const job = jobById[item.workTool.job];
  const materials = jobMaterials(job).map((id) => tr(materialById[id].name));
  const list =
    materials.length > 1 ? t('workTool.or', { head: materials.slice(0, -1).join(', '), last: materials[materials.length - 1] }) : (materials[0] ?? '');
  return [
    {
      emoji: job.emoji,
      text: t('workTool.line', {
        job: tr(job.name),
        percent: formatPercent(workToolRules.outputBonus[item.tier - 1]),
        chance: formatPercent(workToolRules.scavenge.chance),
        count: workToolRules.scavenge.amount,
        materials: list,
      }),
    },
  ];
}
