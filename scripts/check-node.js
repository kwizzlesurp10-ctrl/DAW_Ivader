var v = process.version.slice(1).split('.').map(Number);
var major = v[0];
if (major < 18) {
  console.error('This project requires Node.js 18 or later. Current: ' + process.version);
  console.error('');
  console.error('Options:');
  console.error('  1. nvm use 20   (or fnm use 20), then run your command again');
  console.error('  2. npm run build:nvm   — uses nvm Node 20/18 if installed');
  console.error('  3. PATH="/usr/bin:$PATH" npm run build   — use system Node if it is 18+');
  process.exit(1);
}
