import { ForgeStation } from '@/components/ForgeStation';
import { timed } from '@/components/timed';

function ForgeScreen() {
  return <ForgeStation />;
}

export default timed('screen: forge', ForgeScreen);
