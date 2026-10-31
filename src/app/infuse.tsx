import { InfuseStation } from '@/components/InfuseStation';
import { useLanguage } from '@/hooks/useLanguage';

export default function InfuseScreen() {
  useLanguage();
  return <InfuseStation />;
}
