import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
}
walk(root);

const findings = { rpc: [], table: [], route: [], suspicious: [] };
const add = (type, value, file, line, detail = '') => findings[type].push({ value, file: path.relative(process.cwd(), file), line, detail });

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    const line = index + 1;
    for (const match of lineText.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)) add('rpc', match[1], file, line);
    for (const match of lineText.matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]/g)) add('table', match[1], file, line);
    for (const match of lineText.matchAll(/\bto=["']([^"']+)["']/g)) add('route', match[1], file, line);
    if (/TODO|FIXME|HACK|placeholder/i.test(lineText) && !/placeholder=/.test(lineText)) add('suspicious', 'marker', file, line, lineText.trim());
    if (/href=["']#["']/.test(lineText) || /to=["']["']/.test(lineText)) add('suspicious', 'empty-link', file, line, lineText.trim());
  });
}

function printSection(name, rows) {
  console.log(`\n=== ${name} (${rows.length}) ===`);
  for (const row of rows) console.log(`${row.value}\t${row.file}:${row.line}${row.detail ? `\t${row.detail}` : ''}`);
}

for (const key of ['rpc','table','route','suspicious']) {
  const unique = [...new Map(findings[key].map((x) => [`${x.value}|${x.file}|${x.line}`, x])).values()]
    .sort((a,b) => a.value.localeCompare(b.value) || a.file.localeCompare(b.file) || a.line-b.line);
  printSection(key.toUpperCase(), unique);
}

console.log(`\nScanned ${files.length} TypeScript/TSX files.`);
