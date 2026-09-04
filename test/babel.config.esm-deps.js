// Minimal Babel config used ONLY by Jest, ONLY to downlevel ESM-only
// node_modules packages (e.g. `jose`) to CommonJS so ts-jest's CJS-mode
// loader can require() them. Application/test TypeScript is still owned
// entirely by ts-jest — this file never touches .ts files.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
