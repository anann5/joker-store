// jest.config.js
module.exports = {
  // The transformIgnorePatterns option is used to specify which files should not be transformed by Babel.
  // By default, Jest doesn't transform anything in node_modules.
  // Since 'uuid' is an ES module and our project is CommonJS, we need to tell Jest to transform it.
  // The pattern below is a negative lookahead that tells Jest to ignore all files in node_modules
  // EXCEPT for the 'uuid' module.
  transformIgnorePatterns: ['/node_modules/(?!uuid)'],
  // Ignore tooling/private directories (e.g. .kilo worktrees) so `npm test` stays deterministic.
  testPathIgnorePatterns: ['/node_modules/', '/\\.kilo/'],
};
