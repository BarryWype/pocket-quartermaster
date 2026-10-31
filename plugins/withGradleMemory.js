// Gives the Gradle daemon enough memory for the Kotlin and native builds.
// The default from prebuild (-Xmx2048m, 512m metaspace) runs out ("Metaspace")
// on release builds; android/ is regenerated, so the setting lives here.
const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs'));
    cfg.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    return cfg;
  });
};
