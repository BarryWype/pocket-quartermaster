// Adds what app.json can't hold: the release signing and build-time version code
// plugins, and the version CI passes in (APP_VERSION from the tag).
module.exports = ({ config }) => ({
  ...config,
  version: process.env.APP_VERSION ?? config.version,
  plugins: [...(config.plugins ?? []), './plugins/withReleaseSigning', './plugins/withBuildTimeVersionCode'],
});
