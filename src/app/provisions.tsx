import { CraftingStation, useCraftingRail } from '@/components/CraftingStation';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/i18n';
import { timed } from '@/components/timed';
import { Deferred, DiamondRail, GhostScreen } from '@/components/ui';

function ProvisionsScreen() {
  useLanguage();
  const rail = useCraftingRail('provisions');
  return (
    <Deferred
      name="provisions"
      ghost={rail && <GhostScreen variant="grid" rail={<DiamondRail items={rail.items} selected={rail.selected} onSelect={() => {}} />} />}
    >
      <CraftingStation station="provisions" action={t('crafting.brew')} />
    </Deferred>
  );
}

export default timed('screen: provisions', ProvisionsScreen);
