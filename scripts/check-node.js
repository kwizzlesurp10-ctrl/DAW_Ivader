var v = process.version.slice(1).split('.').map(Number);
var major = v[0];
if (major < 18) {
  console.error('This project requires Node.js 18 or later. Current: ' + process.version);
  console.error('Upgrade Node: nvm use 20  (or fnm use 20), or install from https://nodejs.org');
  process.exit(1);
}
