const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bloquer les binaires natifs pour plateformes non-Windows (Linux/macOS/ARM)
// qui n'existent pas sur ce système et font crasher le file watcher Metro.
config.resolver.blockList = [
  /node_modules[/\\]lightningcss-linux.*[/\\]/,
  /node_modules[/\\]lightningcss-darwin.*[/\\]/,
  /node_modules[/\\]lightningcss-win32-arm64.*[/\\]/,
  /node_modules[/\\]lightningcss-win32-ia32.*[/\\]/,
];

module.exports = config;
