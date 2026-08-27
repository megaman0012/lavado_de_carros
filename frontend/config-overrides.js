module.exports = function override(config) {
  const oneOfRule = config.module.rules.find(r => r.oneOf);
  if (!oneOfRule) return config;

  // Compatibilidad babel con React 19 (fix heredado del proyecto base)
  oneOfRule.oneOf.forEach((rule) => {
    if (
      rule.loader && rule.loader.includes('babel-loader') &&
      rule.include && rule.include.toString().includes('src')
    ) {
      if (!rule.options) rule.options = {};
      if (!rule.options.plugins) rule.options.plugins = [];
      rule.options.plugins.push(require.resolve('@babel/plugin-transform-classes'));
    }
  });

  return config;
};
