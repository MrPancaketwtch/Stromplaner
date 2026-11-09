// Gibt die Changelog-Einträge einer Version als Markdown aus (für den Release-Text auf GitHub).
// Betas (1.6.0-beta.1) zeigen die Einträge der kommenden Version (1.6.0). Aufruf: node scripts/changelog-notizen.js 1.6.0
const fs = require('fs');
const path = require('path');

const version = String(process.argv[2] || '').replace(/^v/, '');
const basis = version.split('-')[0];
const quelle = fs.readFileSync(path.join(__dirname, '..', 'app', 'Stromplaner.jsx'), 'utf8').replace(/\r\n/g, '\n');

const start = quelle.indexOf(`\n  "${basis}": [\n`);
if (!basis || start < 0) process.exit(0);
const ende = quelle.indexOf('\n  ],', start + 1);
const eintraege = quelle.slice(start, ende).split('\n').slice(2)
  .map(z => z.trim().replace(/,$/, ''))
  .filter(z => z.startsWith('"'))
  .map(z => JSON.parse(z));

if (eintraege.length) process.stdout.write(`## Neu in ${basis}\n\n${eintraege.map(e => `- ${e}`).join('\n')}\n`);
