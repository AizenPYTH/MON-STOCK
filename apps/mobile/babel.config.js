// Configuration Babel « projet » : s'applique aussi aux modules partagés de ../../src (Metro et Jest).
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
