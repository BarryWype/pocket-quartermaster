import { rosterRules } from '@/content/roster';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FamilyTag } from '@/components/FamilyTag';
import { statIcons } from '@/components/GearRow';
import { GameIcon } from '@/components/GameIcon';
import { HpBar } from '@/components/HpBar';
import { SpecialLabel } from '@/components/SpecialLabel';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { Deferred, GhostScreen, ParchmentCard, WoodButton } from '@/components/ui';
import { heroClasses } from '@/content/heroes';
import { systemIcons } from '@/content/systemIcons';
import { traitById } from '@/content/traits';
import { heroDamageStat, heroStats, isOnExpedition } from '@/game/team/team';
import { rosterCap } from '@/game/guild/guild';
import { useLanguage } from '@/hooks/useLanguage';
import { navigate } from '@/services/navigation';
import { t, tr, type TextKey } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';
import { timed } from '@/components/timed';

/** A leading ' · ' separator stripped when the fragment is shown on its own. */
function alone(key: TextKey): string {
  return t(key).replace(/^\s*·\s*/, '').trim();
}

function TeamScreen() {
  return (
    <Deferred name="team" ghost={<GhostScreen variant="cards" />}>
      <TeamContent />
    </Deferred>
  );
}

function TeamContent() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const freeBunks = Math.max(0, rosterCap(save) - save.heroes.length);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <TutorialHint screen="team" />
      <View style={styles.header}>
        <Text style={styles.roster}>
          {t('team.roster', { count: save.heroes.length, cap: rosterCap(save), party: rosterRules.partySize })}
        </Text>
      </View>
      <WoodButton emoji="📜" title={t('classes.link')} onPress={() => navigate('/team/classes')} />
      {save.heroes.map((hero) => {
        const heroClass = heroClasses[hero.classId];
        const away = isOnExpedition(save, hero.id);
        const escort = save.escort?.heroId === hero.id;
        const patrol = save.patrolFights.some((fight) => fight.heroIds.includes(hero.id));
        const status = away
          ? alone('common.onExpedition')
          : escort
            ? alone('common.escort')
            : patrol
              ? alone('common.patrol')
              : t('team.ready');
        const stats = heroStats(save, hero);
        const damageStat = heroDamageStat(save, hero);
        return (
          <Pressable
            key={hero.id}
            accessibilityRole="button"
            accessibilityLabel={`${hero.name}, ${tr(heroClass.name)}, ${t('common.level', { level: hero.level })}`}
            onPress={() => navigate({ pathname: '/team/[heroId]', params: { heroId: hero.id } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <ParchmentCard contentStyle={styles.card}>
              <View style={styles.portrait}>
                <View style={styles.portraitSeams} pointerEvents="none">
                  {Array.from({ length: 6 }, (_, i) => (
                    <View key={i} style={[styles.portraitSeam, { top: (i + 1) * 10 }]} />
                  ))}
                </View>
                <View style={styles.portraitBrass} pointerEvents="none" />
                <GameIcon emoji={heroClass.emoji} icon={heroClass.icon} size={46} />
                <View style={styles.levelDiamond}>
                  <View style={styles.levelDiamondFace}>
                    <Text style={styles.levelText}>{hero.level}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.body}>
                <View style={styles.titleLine}>
                  <Text style={styles.name}>{hero.name}</Text>
                  <Text style={[styles.status, !away && !escort && !patrol && styles.statusReady]}>{status}</Text>
                </View>
                <View style={styles.classRow}>
                  <Text style={styles.classLine}>{tr(heroClass.name)}</Text>
                  <FamilyTag family={heroClass.familyTag} size={14} labelStyle={styles.classLine} />
                  <Text style={styles.classLine}>{tr(traitById[hero.trait]?.name ?? '')}</Text>
                  <SpecialLabel classId={hero.classId} special={hero.special} labelStyle={styles.classLine} />
                </View>
                <HpBar save={save} hero={hero} />
                <View style={styles.statRow}>
                  {(['hp', damageStat, 'armour', 'speed'] as const).map((stat) => (
                    <View key={stat} style={styles.statCell}>
                      <GameIcon emoji={statIcons[stat]} icon={systemIcons[statIcons[stat]]} size={12} />
                      <Text style={styles.statValue}>{stats[stat]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ParchmentCard>
          </Pressable>
        );
      })}
      {Array.from({ length: freeBunks }, (_, i) => (
        <View key={i} style={styles.bunk}>
          <Text style={styles.bunkPlus}>+</Text>
          <Text style={styles.bunkText}>{t('team.emptyBunk')}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: ui.woodDark },
  container: { padding: 14, gap: 12 },
  pressed: { opacity: 0.6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  roster: { fontFamily: fonts.body, fontSize: 20, color: ui.brassLight },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  portrait: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodMid,
    borderWidth: 3,
    borderColor: ui.outline,
  },
  portraitSeams: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  portraitSeam: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: ui.woodSeam },
  portraitBrass: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
    borderColor: ui.brass,
  },
  levelDiamond: {
    position: 'absolute',
    left: -9,
    bottom: -9,
    width: 28,
    height: 28,
    transform: [{ rotate: '45deg' }],
    backgroundColor: ui.ember,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  levelDiamondFace: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-45deg' }] },
  levelText: { fontFamily: fonts.body, fontSize: 16, color: ui.onEmber },
  body: { flex: 1, gap: 3 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontFamily: fonts.body, fontSize: 23, color: ui.ink, lineHeight: 24 },
  status: { fontFamily: fonts.serifBold, fontSize: 12, color: ui.bad },
  statusReady: { color: ui.good },
  classRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  classLine: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  statRow: { flexDirection: 'row', gap: 3 },
  statCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: ui.parchmentShade,
    borderWidth: 1,
    borderColor: ui.parchmentRule,
  },
  statValue: { fontFamily: fonts.serifBold, fontSize: 12, color: ui.ink },
  bunk: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: ui.inkMuted,
    backgroundColor: ui.woodDeep,
  },
  bunkPlus: { fontFamily: fonts.body, fontSize: 19, color: ui.brassDim },
  bunkText: { fontFamily: fonts.serif, fontSize: 15, color: ui.onWoodMuted },
});

export default timed('screen: team', TeamScreen);
