import { CraftingStation } from '@/components/CraftingStation';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/i18n';

export default function AlchemyScreen() {
  useLanguage();
  return <CraftingStation station="alchemy" action={t('crafting.brew')} />;
}
