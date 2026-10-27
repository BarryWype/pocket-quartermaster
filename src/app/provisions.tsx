import { CraftingStation } from '@/components/CraftingStation';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/i18n';

export default function ProvisionsScreen() {
  useLanguage();
  return <CraftingStation station="provisions" action={t('crafting.brew')} />;
}
