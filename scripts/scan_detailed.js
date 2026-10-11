const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(file)) {
        results = results.concat(walk(full));
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('./src');
const rawTextRegex = />\s*([A-Za-z][A-Za-z0-9 ,.:;/'"?!-]{2,})\s*</g;

const allowedWords = new Set([
  'MAP', 'HR', 'SPO2', 'ETCO2', 'BIS', 'ECG', 'MMHG', '%', 'ML/MIN', 'ML', 'MG', 'MCG',
  'KG', 'H', 'MIN', 'S', 'MS', 'HZ', 'L', 'G', 'CMH2O', 'MAC', 'KPA', 'ET', 'FIO2',
  'NIBP', 'ART', 'CVP', 'SVV', 'SVR', 'CI', 'CO', 'HPI', 'IOH', 'ASA', 'ASA-PS', 'GA',
  'CRCL', 'IV', 'AIMS', 'CDS', 'PACU', 'OR', 'TEL', 'EN', 'VI', 'LIVE', 'ON', 'OFF',
  'ICU', 'ID', 'RR', 'VT', 'PEEP', 'PIP', 'PPLAT', 'COMP', 'RAW', 'MV', 'IE', 'PROV-O', 'W3C',
  'VTID', 'NIBP', 'SEVO', 'ISO', 'DES', 'FENT', 'PROP', 'ROCU', 'SUCC', 'NEO', 'EPI', 'NOREPI'
]);

let grouped = {};

files.forEach(file => {
  if (file.includes('LocalizationContext') || file.includes('messages')) return;
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = rawTextRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text.startsWith('{') || text.endsWith('}')) continue;
    const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (allowedWords.has(clean)) continue;
    if (/^[0-9]+.*$/.test(text)) continue;
    
    // Check if it's purely punctuation or symbols
    if (!/[a-zA-Z]/.test(text)) continue;

    if (!grouped[file]) grouped[file] = [];
    grouped[file].push({
      text,
      line: content.substring(0, match.index).split('\n').length
    });
  }
});

for (const [file, items] of Object.entries(grouped)) {
  console.log('=== ' + file + ' (' + items.length + ') ===');
  items.forEach(i => console.log('  L' + i.line + ': "' + i.text + '"'));
}
