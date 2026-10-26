const { withAppBuildGradle } = require('expo/config-plugins');

// Signs release builds with the release keystore when its Gradle properties are
// set (in ~/.gradle/gradle.properties locally, or ORG_GRADLE_PROJECT_* env vars
// in CI), and with the debug key otherwise.
const PROPERTY = 'PQ_RELEASE_STORE_FILE';

const releaseConfig = `    signingConfigs {
        release {
            if (findProperty('${PROPERTY}')) {
                storeFile file(findProperty('${PROPERTY}'))
                storePassword findProperty('PQ_RELEASE_STORE_PASSWORD')
                keyAlias findProperty('PQ_RELEASE_KEY_ALIAS')
                keyPassword findProperty('PQ_RELEASE_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes(PROPERTY)) return mod;
    gradle = gradle.replace('    signingConfigs {', releaseConfig);
    gradle = gradle.replace(
      /(release \{[^}]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig findProperty('${PROPERTY}') ? signingConfigs.release : signingConfigs.debug`,
    );
    if (!gradle.includes(`findProperty('${PROPERTY}') ? signingConfigs.release`)) {
      throw new Error('withReleaseSigning: could not find the release signingConfig in app/build.gradle');
    }
    mod.modResults.contents = gradle;
    return mod;
  });
};
