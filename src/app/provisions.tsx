import { CraftingStation } from '@/components/CraftingStation';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/i18n';
import { timed } from '@/components/timed';

function ProvisionsScreen() {
  useLanguage();
  return <CraftingStation station="provisions" action={t('crafting.brew')} />;
}

export default timed('screen: provisions', ProvisionsScreen);
