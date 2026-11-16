const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Permite importar o banco de perguntas compartilhado do app web
// (src/games/quiz/bank.js) sem duplicar as 1.300 perguntas no mobile.
config.watchFolders = [path.resolve(workspaceRoot, 'src')];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
