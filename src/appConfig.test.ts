import { readFileSync } from 'fs';
import { join } from 'path';

type Plugin = string | [string, Record<string, unknown>];

const config = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')) as {
  expo: { plugins: Plugin[] };
};

const locationPlugin = config.expo.plugins.find(
  (plugin): plugin is [string, Record<string, unknown>] => Array.isArray(plugin) && plugin[0] === 'expo-location',
);

describe('app.json expo-location plugin options', () => {
  it('keeps the plugin configured', () => {
    expect(locationPlugin).toBeDefined();
  });

  it('keeps Android background location enabled (ACCESS_BACKGROUND_LOCATION in the manifest)', () => {
    expect(locationPlugin?.[1].isAndroidBackgroundLocationEnabled).toBe(true);
  });

  it('keeps the Android foreground location service enabled', () => {
    expect(locationPlugin?.[1].isAndroidForegroundServiceEnabled).toBe(true);
  });
});
