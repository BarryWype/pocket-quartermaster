import { gatheringConfig } from '@/content/gatheringConfig';

import { createInitialSave, type SaveData } from '../save';
import { migrateSettingsV2, needsBackgroundState, patrolSettingsFrom, pocketTracking, type PocketModeSettings } from './pocketMode';

const settings = (overrides: Partial<PocketModeSettings> = {}): PocketModeSettings => ({
  enabled: true,
  autoGather: true,
  patrolAlerts: true,
  escort: true,
  autoStopMinutes: gatheringConfig.autoGather.autoStopMinutes,
  introSeen: false,
  ...overrides,
});

describe('pocketTracking', () => {
  it('is off while Pocket mode is off', () => {
    expect(pocketTracking(settings({ enabled: false }))).toBe(false);
  });

  it('is off when all three options are off', () => {
    expect(pocketTracking(settings({ autoGather: false, patrolAlerts: false, escort: false }))).toBe(false);
  });

  it('runs with any one option on', () => {
    expect(pocketTracking(settings({ patrolAlerts: false, escort: false }))).toBe(true);
    expect(pocketTracking(settings({ autoGather: false, escort: false }))).toBe(true);
    expect(pocketTracking(settings({ autoGather: false, patrolAlerts: false }))).toBe(true);
  });
});

describe('migrateSettingsV2', () => {
  it('turns auto-gather on into Pocket mode on, keeping the stop delay and the intro', () => {
    const migrated = migrateSettingsV2({ autoGather: { enabled: true, autoStopMinutes: 60, introSeen: true } });
    expect(migrated.pocketMode).toEqual({
      enabled: true,
      autoGather: true,
      patrolAlerts: true,
      escort: true,
      autoStopMinutes: 60,
      introSeen: true,
    });
    expect(migrated.autoGather).toBeUndefined();
  });

  it('keeps Pocket mode off when auto-gather was off', () => {
    const migrated = migrateSettingsV2({ autoGather: { enabled: false, autoStopMinutes: 15, introSeen: true } });
    expect(migrated.pocketMode).toEqual({
      enabled: false,
      autoGather: true,
      patrolAlerts: true,
      escort: true,
      autoStopMinutes: 15,
      introSeen: true,
    });
  });

  it('falls back to the defaults without the old settings', () => {
    const migrated = migrateSettingsV2({ language: 'en' });
    expect(migrated.pocketMode).toEqual({
      enabled: false,
      autoGather: true,
      patrolAlerts: true,
      escort: true,
      autoStopMinutes: gatheringConfig.autoGather.autoStopMinutes,
      introSeen: false,
    });
    expect(migrated.language).toBe('en');
  });
});

describe('patrolSettingsFrom', () => {
  const save = (heroId: string | null): SaveData => ({ ...createInitialSave(), escort: heroId ? { heroId } : null });

  it('sends the escort the save names, when the option is on', () => {
    expect(patrolSettingsFrom(settings(), save('bram'), 'all')).toEqual({
      escortHeroId: 'bram',
      alertFor: 'all',
      patrolAlerts: true,
      escortAlerts: true,
    });
    expect(patrolSettingsFrom(settings(), save(null), 'off').escortHeroId).toBeNull();
  });

  it('sends no escort when the option is off, and keeps the alert settings', () => {
    expect(patrolSettingsFrom(settings({ escort: false, patrolAlerts: false }), save('bram'), 'banditsTravellers')).toEqual({
      escortHeroId: null,
      alertFor: 'banditsTravellers',
      patrolAlerts: false,
      escortAlerts: true,
    });
  });
});

describe('needsBackgroundState', () => {
  it('wants the state whenever tracking runs: quest targets are watched even without patrols or the escort', () => {
    expect(needsBackgroundState(settings({ enabled: false }))).toBe(false);
    expect(needsBackgroundState(settings({ autoGather: false, patrolAlerts: false, escort: false }))).toBe(false);
    expect(needsBackgroundState(settings({ autoGather: true, patrolAlerts: false, escort: false }))).toBe(true);
    expect(needsBackgroundState(settings({ autoGather: false }))).toBe(true);
    expect(needsBackgroundState(settings({ autoGather: false, patrolAlerts: false }))).toBe(true);
  });
});
