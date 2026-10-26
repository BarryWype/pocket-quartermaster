// Content files require() their icons; Node can't load images, so each one becomes its path.
for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp']) {
  require.extensions[ext] = (module, filename) => {
    module.exports = filename;
  };
}
