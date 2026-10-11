const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const standaloneDir = path.join(repoRoot, '.next', 'standalone');
const rootStatic = path.join(repoRoot, '.next', 'static');
const standaloneStatic = path.join(standaloneDir, '.next', 'static');
const rootPublic = path.join(repoRoot, 'public');
const standalonePublic = path.join(standaloneDir, 'public');

if (fs.existsSync(standaloneDir)) {
  if (fs.existsSync(rootStatic)) {
    fs.mkdirSync(path.dirname(standaloneStatic), { recursive: true });
    fs.cpSync(rootStatic, standaloneStatic, { recursive: true, force: true });
  }
  if (fs.existsSync(rootPublic)) {
    fs.mkdirSync(standaloneDir, { recursive: true });
    fs.cpSync(rootPublic, standalonePublic, { recursive: true, force: true });
  }
}
