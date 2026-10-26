// Adds what app.json can't hold: the release signing plugin, and the version
// and version code CI passes in (APP_VERSION from the tag, ANDROID_VERSION_CODE
// from the run number) so every release installs as an update.
module.exports = ({ config }) => ({
  ...config,
  version: process.env.APP_VERSION ?? config.version,
  android: {
    ...config.android,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? config.android?.versionCode ?? 1),
  },
  plugins: [...(config.plugins ?? []), './plugins/withReleaseSigning'],
});
