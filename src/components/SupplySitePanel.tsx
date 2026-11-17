import { StyleSheet, View } from 'react-native';

import { IconLabel } from '@/components/IconLabel';
import { Overlay } from '@/components/Overlay';
import { ParchmentCard, EmberButton, WoodButton } from '@/components/ui';
import { Price } from '@/components/Price';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { TimerStrip } from '@/components/TimerStrip';
import { materialById } from '@/content/lookup';
import { placeInfo, placeRules } from '@/content/places';
import { supplyRules } from '@/content/supplyLines';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import type { PlaceSpawn } from '@/game/places/generate';
import { networkPlacesAround } from '@/game/supply/discovery';
import { openBuildingKinds, buildCost, buildingNameKey, buildingReach, buildProblem, type BuildProblem } from '@/game/supply/buildings';
import { siteQuality } from '@/game/supply/sites';
import type { BuildingKind } from '@/game/supply/types';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { formatDistance, t, type TextKey } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { clockConfig } from '@/content/clockConfig';
import { feel } from '@/services/feel';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { colors, ui } from '@/theme';

type Props = { site: PlaceSpawn; player: LatLng; onClose: () => void };

const qualityKey: Record<1 | 2 | 3, TextKey> = { 1: 'supply.site.quality.one', 2: 'supply.site.quality.two', 3: 'supply.site.quality.three' };
const forKindKey: Record<string, TextKey> = {
  tavern: 'supply.site.for.tavern',
  smithy: 'supply.site.for.smithy',
  apothecary: 'supply.site.for.apothecary',
};

/** The stars a site's quality gives: filled up to its quality, empty after. */
const Stars = ({ quality }: { quality: 1 | 2 | 3 }) => <Text style={styles.stars}>{`${'★'.repeat(quality)}${'☆'.repeat(3 - quality)}`}</Text>;

/**
 * A site's sheet. Undiscovered it says only what to do and how far; discovered
 * it shows the ground's quality and one card per building kind, each with its
 * own Build button and the reason it cannot be pressed.
 */
export function SupplySitePanel({ site, player, onClose }: Props) {
  const save = useGameStore((s) => s.save);
  const build = useGameStore((s) => s.build);
  const debugExpireSite = useGameStore((s) => s.debugExpireSite);
  const debugOn = useDebugStore(debugEnabled);
  const now = useNow(clockConfig.minutesMs);
  const discovered = site.id in save.supply.discovered;
  if (!discovered) {
    return (
      <Overlay onClose={onClose} position="bottom">
        <Sheet
          variant="wood"
          emoji="🪧"
          title={t('supply.site.emptyTitle')}
          subtitle={t('supply.site.notVisited')}
          footer={<WoodButton title={t('common.close')} onPress={onClose} />}
        >
          <TimerStrip expiresAt={site.expiresAt} />
          <View style={styles.banner}>
            <IconLabel emoji="👣" label={t('supply.discover.walkHere')} size={18} labelStyle={styles.bannerText} />
            <Text style={styles.line}>{t('supply.site.discoverMore')}</Text>
          </View>
          <DistanceLines site={site} player={player} hall={save.supply.hall} />
        </Sheet>
      </Overlay>
    );
  }

  const quality = siteQuality(site);
  const reach = buildingReach(save);
  const kinds = openBuildingKinds(save);
  const problems = Object.fromEntries(kinds.map((kind) => [kind, buildProblem(save, site, kind, player, now)])) as Record<BuildingKind, BuildProblem>;
  // One reason that stops every building gets the banner; the same words serve under each disabled button.
  const blocking = kinds.length > 0 ? (['noHall', 'tooFarFromHall', 'full'] as const).find((reason) => kinds.every((kind) => problems[kind] === reason)) : undefined;
  const blockingText =
    blocking === 'noHall'
      ? t('supply.site.blocked.noHall')
      : blocking === 'tooFarFromHall'
        ? t('supply.site.blocked.tooFarFromHall', { distance: formatDistance(reach.meters), tier: highestUnlockedTier(save) })
        : blocking === 'full'
          ? t('supply.site.blocked.full', { max: reach.count })
          : null;
  // The card that serves the nearest discovered place is the one to press.
  const nearest = networkPlacesAround(save, site.position, now)
    .filter((place) => place.id in save.supply.discovered && place.startsAt <= now && now < place.expiresAt)
    .reduce<PlaceSpawn | null>((best, place) => (best === null || distanceMeters(site.position, place.position) < distanceMeters(site.position, best.position) ? place : best), null);
  const emberKind = nearest ? (kinds.find((kind) => supplyRules.buildings.kinds[kind].for === nearest.kind) ?? 'farm') : 'farm';

  const onBuild = (kind: BuildingKind, free: boolean) => {
    build(site, kind, player, free);
    feel('reward');
    const built = useGameStore.getState().save.supply.buildings.find((entry) => entry.siteId === site.id);
    if (built) {
      useMapPanels.getState().closeSite();
      useMapPanels.getState().openSupplyBuilding(built.id);
    }
  };

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet
        variant="wood"
        emoji="🪧"
        title={
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('supply.site.label')}</Text>
            <Stars quality={quality} />
          </View>
        }
        subtitle={t(qualityKey[quality])}
        footer={<WoodButton title={t('common.close')} onPress={onClose} />}
      >
        <TimerStrip expiresAt={site.expiresAt} />
        <DistanceLines site={site} player={player} hall={save.supply.hall} />
        <Text style={styles.line}>
          {t('supply.site.limits', { count: save.supply.buildings.length, max: reach.count, distance: formatDistance(reach.meters) })}
        </Text>
        {blockingText && (
          <View style={[styles.banner, styles.blocked]}>
            <Text style={styles.line}>{blockingText}</Text>
          </View>
        )}
        {kinds.map((kind) => (
          <BuildingCard
            key={kind}
            kind={kind}
            quality={quality}
            problem={problems[kind]}
            blockingText={blockingText}
            walkDistance={distanceMeters(player, site.position)}
            ember={kind === emberKind}
            onBuild={onBuild}
          />
        ))}
        {debugOn && <WoodButton compact title={t('supply.site.expire')} onPress={() => debugExpireSite(site)} />}
      </Sheet>
    </Overlay>
  );
}

/** The one distance line: from the player, and from the hall. */
function DistanceLines({ site, player, hall }: { site: PlaceSpawn; player: LatLng; hall: { cell: string } | null }) {
  return (
    <View style={styles.distanceRow}>
      <Text style={styles.line}>
        {distanceMeters(player, site.position) <= placeRules.interactionMeters
          ? t('supply.youAreHere')
          : t('supply.site.fromYou', { distance: formatDistance(distanceMeters(player, site.position)) })}
      </Text>
      {hall && (
        <Text style={styles.line}>{t('supply.site.fromHall', { distance: formatDistance(distanceMeters(tileCenter(hall.cell), site.position)) })}</Text>
      )}
    </View>
  );
}

/** One building kind: what it makes, who wants it, and its own Build button with the cost. */
function BuildingCard({
  kind,
  quality,
  problem,
  blockingText,
  walkDistance,
  ember,
  onBuild,
}: {
  kind: BuildingKind;
  quality: 1 | 2 | 3;
  problem: BuildProblem;
  blockingText: string | null;
  /** How far the player stands from the site, for the walk-to-build reason. */
  walkDistance: number;
  ember: boolean;
  onBuild: (kind: BuildingKind, free: boolean) => void;
}) {
  const debugOn = useDebugStore(debugEnabled);
  const rules = supplyRules.buildings.kinds[kind];
  const gold = useGameStore(({ save }) => buildCost(save).gold);
  const { materials } = supplyRules.buildings.cost;
  const totalWeight = Object.values(rules.makes).reduce((sum, weight) => sum + weight, 0);
  return (
    <ParchmentCard contentStyle={styles.card}>
      <View style={styles.cardRow}>
        <IconLabel
          emoji={materialById[Object.keys(rules.makes)[0]]?.emoji ?? '❔'}
          icon={materialById[Object.keys(rules.makes)[0]]?.icon}
          label={t(buildingNameKey[kind])}
          size={20}
          labelStyle={styles.cardTitle}
        />
        <Text style={styles.muted}>{t('supply.site.makes')}</Text>
      </View>
      <View style={styles.cardRow}>
        {Object.entries(rules.makes).map(([materialId, weight]) => (
          <IconLabel
            key={materialId}
            emoji={materialById[materialId]?.emoji ?? '❔'}
            icon={materialById[materialId]?.icon}
            label={t('supply.site.perHour', { rate: Math.round(rules.baseRate * quality * (weight / totalWeight) * 100) / 100 })}
            size={16}
          />
        ))}
        <Text style={styles.muted}>{t('supply.site.withHero')}</Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.muted}>{t('supply.site.forWord')}</Text>
        {rules.for ? (
          <IconLabel emoji={placeInfo[rules.for].emoji} label={t(forKindKey[rules.for])} size={16} />
        ) : (
          <IconLabel emoji="🏠" label={t('supply.site.forWorkshop')} size={16} />
        )}
      </View>
      <View style={styles.cardRow}>
        {ember ? (
          <EmberButton compact style={styles.build} title={t('supply.site.build')} disabled={problem !== null} onPress={() => onBuild(kind, false)} />
        ) : (
          <WoodButton compact style={styles.build} title={t('supply.site.build')} disabled={problem !== null} onPress={() => onBuild(kind, false)} />
        )}
        <Price amount={gold} size={18} />
        <IconLabel
          emoji={materialById['wood']?.emoji ?? '🪵'}
          icon={materialById['wood']?.icon}
          label={String(materials[0].amount)}
          size={18}
        />
      </View>
      {problem !== null && (
        <Text style={styles.reason}>
          {problem === 'notHere'
            ? t('supply.site.reason.notHere', { distance: formatDistance(walkDistance) })
            : problem === 'cost'
              ? t('supply.site.reason.cost')
              : blockingText}
        </Text>
      )}
      {debugOn && <WoodButton compact title={t('supply.site.buildFree')} onPress={() => onBuild(kind, true)} />}
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 23, color: ui.brassLight },
  stars: { fontSize: 18, color: ui.brassLight },
  line: { color: ui.ink },
  muted: { color: ui.inkMuted },
  banner: { gap: 6, padding: 10, borderWidth: 2, borderColor: ui.brass, backgroundColor: ui.parchmentShade },
  blocked: { borderColor: colors.danger },
  bannerText: { color: ui.ink },
  distanceRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  card: { gap: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cardTitle: { fontSize: 18, color: ui.ink },
  build: { flex: 1 },
  reason: { color: ui.inkMuted },
});
