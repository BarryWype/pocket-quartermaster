import { CraftingStation } from '@/components/CraftingStation';
import { t } from '@/i18n';

export default function ForgeScreen() {
  return <CraftingStation station="forge" action={t('crafting.forge')} />;
}
