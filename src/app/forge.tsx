import { ForgeStation, useForgeRail } from '@/components/ForgeStation';
import { timed } from '@/components/timed';
import { Deferred, DiamondRail, GhostScreen } from '@/components/ui';

function ForgeScreen() {
  const rail = useForgeRail();
  return (
    <Deferred
      name="forge"
      ghost={<GhostScreen variant="grid" rail={<DiamondRail items={rail.items} selected={rail.selected} onSelect={() => {}} />} />}
    >
      <ForgeStation />
    </Deferred>
  );
}

export default timed('screen: forge', ForgeScreen);
