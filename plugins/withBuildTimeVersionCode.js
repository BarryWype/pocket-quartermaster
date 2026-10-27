const { withAppBuildGradle } = require('expo/config-plugins');

// Sets the Android version code to the build time in minutes, computed by Gradle
// on every build, so any newer build (local or CI) installs over an older one.
module.exports = function withBuildTimeVersionCode(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(
      /versionCode \d+/,
      'versionCode((int) (System.currentTimeMillis() / 60000))',
    );
    return mod;
  });
};
