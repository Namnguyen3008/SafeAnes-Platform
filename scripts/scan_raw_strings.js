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
console.log('Total TSX files:', files.length);

// Regex to detect raw text between JSX tags like >Some Text<
// Ignoring purely whitespace, numbers, symbols
const rawTextRegex = />\s*([A-Za-z][A-Za-z0-9 ,.:;/'"?!-]{3,})\s*</g;

const allowedPatterns = [
  /^[A-Z0-9_\-\.\:\/]+$/, // Acronyms / IDs / Codes like MAP, HR, SpO2, EtCO2, BIS, ECG, mmHg, %, mL/min, etc.
  /^(mg|mcg|mL|min|mmHg|bpm|kg|h|s|ms|Hz|L|g|cmH2O|MAC|kPa|ET|FiO2|EtCO2|SpO2|MAP|HR|NIBP|ART|CVP|SVV|SVR|CI|CO|HPI|IOH|ASA|ASA-PS|GA|CrCl|IV|AIMS|CDS|PACU|OR|TEL|EN|VI|LIVE|ON|OFF)$/i,
  /^[0-9]+.*$/,
];

let potentialIssues = [];

files.forEach(file => {
  if (file.includes('LocalizationContext') || file.includes('messages')) return;
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = rawTextRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text.startsWith('{') || text.endsWith('}')) continue;
    if (allowedPatterns.some(p => p.test(text))) continue;
    
    // Check if it's already localized or just code
    potentialIssues.push({
      file,
      text,
      line: content.substring(0, match.index).split('\n').length
    });
  }
});

console.log('Found potential raw texts:', potentialIssues.length);
potentialIssues.slice(0, 50).forEach(issue => {
  console.log(`${issue.file}:${issue.line} -> "${issue.text}"`);
});
