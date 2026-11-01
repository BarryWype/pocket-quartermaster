import { InfuseStation } from '@/components/InfuseStation';
import { useLanguage } from '@/hooks/useLanguage';
import { timed } from '@/components/timed';

function InfuseScreen() {
  useLanguage();
  return <InfuseStation />;
}

export default timed('screen: infuse', InfuseScreen);
