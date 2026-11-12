import { useContext } from 'react';
import { StyleSheet, View } from 'react-native';

import { gearProfiles, gearTypeNames } from '@/content/equipment';
import { familyById, type FamilyId } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { threatById } from '@/content/lookup';
import { relics } from '@/content/loot/relics';
import { familyLevel } from '@/game/families/families';
import { levelMarks, tagsForLevel } from '@/game/families/strip';
import type { GearType, HeroClassId } from '@/game/types';
import { localized, t, tr, type TextKey } from '@/i18n';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { navigate } from '@/services/navigation';
import { colors } from '@/theme';

import { IconLabel } from './IconLabel';
import { CloseOverlays, Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { WoodButton } from './ui';

/** What a family is for, in one line: the threat it answers, or its playstyle. */
export function familyRole(family: FamilyId): string {
  const def = familyById[family];
  return def.answers ? t('families.kind.threat', { threat: tr(threatById[def.answers].name) }) : t(`families.role.${family}` as TextKey);
}

/** A family's three levels: the tags each needs and what it does; with a party, the reached ones lit and the next one's missing tags. A threat family adds how it answers its threat. */
export function FamilyLevelLines({ family, count }: { family: FamilyId; /** The party's tags, when there is a party. */ count?: number }) {
  const def = familyById[family];
  const details: Record<string, string> = localized({ en, fr }).families.details;
  return (
    <View style={styles.levels}>
      {[1, 2, 3].map((level) => {
        const needed = tagsForLevel(level);
        const reached = count !== undefined && count >= needed;
        const isNext = count !== undefined && !reached && (level === 1 || count >= tagsForLevel(level - 1));
        const detail = details[`${family}${level}`];
        return (
          <View key={level} style={[styles.level, reached && styles.reached]}>
            <View style={styles.levelHead}>
              <Text style={[styles.levelTitle, reached && styles.reachedText]}>{t('families.level', { marks: levelMarks(level), count: needed })}</Text>
              {level === 2 && <Text style={styles.toReach}>{t('families.signature')}</Text>}
              {isNext && <Text style={styles.toReach}>{t('families.toReach', { count: needed - count })}</Text>}
            </View>
            <Text style={styles.effect}>{t(`families.effects.${family}${level}` as TextKey)}</Text>
            {detail && <Text style={styles.detail}>{detail}</Text>}
          </View>
        );
      })}
      {def.answers && <Text style={styles.detail}>{t('families.answers', { threat: tr(threatById[def.answers].name), family: tr(def.name) })}</Text>}
    </View>
  );
}

const classIds = Object.keys(heroClasses) as HeroClassId[];
const gearTypes = Object.keys(gearProfiles) as GearType[];

/** Where a family's tags come from: classes, then gear types (×2 when two-handed; a one-handed weapon's second tag too), then relics. */
function FamilySources({ family }: { family: FamilyId }) {
  const classes = classIds.filter((id) => heroClasses[id].familyTag === family);
  const types = gearTypes.filter((type) => gearProfiles[type].familyTag === family || gearProfiles[type].secondFamily === family);
  const extras = relics.filter((relic) => relic.extraFamily === family);
  const group = (title: string, items: { key: string; emoji: string; icon?: Parameters<typeof IconLabel>[0]['icon']; label: string }[]) =>
    items.length > 0 && (
      <View style={styles.group}>
        <Text style={styles.groupTitle}>{title}</Text>
        <View style={styles.sources}>
          {items.map((item) => (
            <IconLabel key={item.key} emoji={item.emoji} icon={item.icon} label={item.label} size={18} labelStyle={styles.source} />
          ))}
        </View>
      </View>
    );
  return (
    <>
      <Text style={styles.heading}>{t('families.where')}</Text>
      {group(
        t('families.classes'),
        classes.map((id) => ({ key: id, emoji: heroClasses[id].emoji, icon: heroClasses[id].icon, label: tr(heroClasses[id].name) })),
      )}
      {group(
        t('families.items'),
        types.map((type) => ({
          key: type,
          emoji: gearProfiles[type].emoji,
          label: gearProfiles[type].twoHanded ? `${tr(gearTypeNames[type].name)} ×2` : tr(gearTypeNames[type].name),
        })),
      )}
      {group(
        t('families.relics'),
        extras.map((relic) => ({ key: relic.id, emoji: gearProfiles[relic.gearType].emoji, icon: relic.icon, label: tr(relic.name) })),
      )}
    </>
  );
}

/**
 * The one family sheet, opened by tapping a family anywhere: what it's for,
 * its three levels, where its tags come from and a link to every family. It
 * is only mounted while open, so it computes nothing until then.
 */
export function FamilySheet({
  family,
  count,
  link = true,
  onClose,
}: {
  family: FamilyId;
  /** The party's tags, when a party is in context. */
  count?: number;
  /** The "All families" link; off on the Families page itself. */
  link?: boolean;
  onClose: () => void;
}) {
  const def = familyById[family];
  // The overlays this sheet opens over: the link closes them all before leaving, and hides under one that must be answered.
  const closeOuter = useContext(CloseOverlays);
  const level = count === undefined ? 0 : familyLevel(count);
  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet
        emoji={def.emoji}
        icon={def.icon}
        title={tr(def.name)}
        subtitle={familyRole(family)}
        bodyStyle={styles.body}
        footer={
          link && closeOuter !== null ? (
            <WoodButton
              title={t('families.all')}
              onPress={() => {
                onClose();
                closeOuter?.();
                navigate('/families');
              }}
            />
          ) : undefined
        }
      >
        {count !== undefined && (
          <Text style={styles.party}>
            {[t('families.party', { count }), levelMarks(level), level < 3 ? t('families.next', { count: tagsForLevel(level + 1) - count, marks: levelMarks(level + 1) }) : '']
              .filter(Boolean)
              .join('  ')}
          </Text>
        )}
        <FamilyLevelLines family={family} count={count} />
        <FamilySources family={family} />
      </Sheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8 },
  party: { fontSize: 17 },
  levels: { gap: 6 },
  level: { gap: 1, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 2, borderColor: colors.parchmentDark },
  reached: { borderColor: colors.gold, backgroundColor: colors.highlight },
  levelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  levelTitle: { fontSize: 16, color: colors.muted },
  reachedText: { color: colors.ink },
  toReach: { fontSize: 15, color: colors.danger },
  effect: { fontSize: 17 },
  detail: { fontSize: 15, color: colors.muted },
  heading: { fontSize: 18, marginTop: 4 },
  group: { gap: 4 },
  groupTitle: { fontSize: 14, color: colors.muted, textTransform: 'uppercase' },
  sources: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  source: { fontSize: 16 },
});
