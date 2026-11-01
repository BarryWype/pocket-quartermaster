import { InfuseStation } from '@/components/InfuseStation';
import { useLanguage } from '@/hooks/useLanguage';
import { timed } from '@/components/timed';
import { Deferred, GhostScreen } from '@/components/ui';

function InfuseScreen() {
  useLanguage();
  return (
    <Deferred name="infuse" ghost={<GhostScreen variant="grid" />}>
      <InfuseStation />
    </Deferred>
  );
}

export default timed('screen: infuse', InfuseScreen);
