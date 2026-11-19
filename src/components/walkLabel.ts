import { formatDistance, t, type Dictionary, type TextKey } from '@/i18n';

type Verb = keyof Dictionary['mapSheet']['verbs'];

/** A locked action's own label while the player is too far: "Walk 320 m to buy". */
export function walkTo(meters: number, verb: Verb): string {
  return t('mapSheet.walkTo', { distance: formatDistance(meters), verb: t(`mapSheet.verbs.${verb}` as TextKey) });
}
