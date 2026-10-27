// Strict checks for the Russian locale, including forms absent from English.
// Run from any directory: node tools/i18n/verify-ru.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const locales = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/desktop/src/shared/i18n/locales');
const pluralSuffix = /_(zero|one|two|few|many|other)$/;
const categories = new Intl.PluralRules('ru').resolvedOptions().pluralCategories;
const problems = [];
let strings = 0;
let pluralGroups = 0;
let identical = 0;

function flatten(value, prefix = '', out = {}) {
  if (typeof value === 'string') out[prefix] = value;
  else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else problems.push(`${prefix}: expected a string or an object`);
  return out;
}

function read(lang, file) {
  try {
    return flatten(JSON.parse(fs.readFileSync(path.join(locales, lang, file), 'utf8')));
  } catch (error) {
    problems.push(`${lang}/${file}: ${error.message}`);
    return {};
  }
}

function tokens(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[0]).sort();
}

function compareTokens(label, source, translation, pattern, location) {
  if (JSON.stringify(tokens(source, pattern)) !== JSON.stringify(tokens(translation, pattern))) {
    problems.push(`${location}: ${label} differ`);
  }
}

const files = fs.readdirSync(path.join(locales, 'en')).filter((file) => file.endsWith('.json')).sort();
for (const file of files) {
  const en = read('en', file);
  const ru = read('ru', file);
  const bases = new Map();
  for (const key of Object.keys(en)) {
    if (!pluralSuffix.test(key)) continue;
    const base = key.replace(pluralSuffix, '');
    if (!bases.has(base) || key.endsWith('_other')) bases.set(base, key);
  }
  pluralGroups += bases.size;

  for (const key of Object.keys(en)) {
    if (!(key in ru)) problems.push(`${file}:${key}: missing translation`);
  }
  for (const base of bases.keys()) {
    for (const category of categories) {
      const key = `${base}_${category}`;
      if (!(key in ru)) problems.push(`${file}:${key}: missing Russian plural form`);
    }
  }

  for (const [key, translated] of Object.entries(ru)) {
    const base = key.replace(pluralSuffix, '');
    const sourceKey = key in en ? key : pluralSuffix.test(key) ? bases.get(base) : undefined;
    if (!sourceKey) {
      problems.push(`${file}:${key}: unknown translation key`);
      continue;
    }
    const source = en[sourceKey];
    const location = `${file}:${key}`;
    strings++;
    if (source === translated) identical++;
    if (source.trim() && !translated.trim()) problems.push(`${location}: empty translation`);
    if (/\u2014/.test(translated)) problems.push(`${location}: em dash (use a comma, colon or hyphen)`);
    if (/\uFFFD/.test(translated)) problems.push(`${location}: Unicode replacement character`);
    if (/^[-+]?\d+(?:[.,]\d+)?[°%]$/.test(source) && source !== translated) {
      problems.push(`${location}: numeric angle or percentage label changed`);
    }
    compareTokens('interpolations', source, translated, /\{\{[^}]*\}\}/g, location);
    compareTokens('tags', source, translated, /<\/?[A-Za-z][^>]*>/g, location);
    compareTokens('links', source, translated, /https?:\/\/[^\s<>"')\]]+/g, location);
    // English prose sometimes pluralises identifiers: DO_JUMPs, NAMED_VALUE_FLOATs.
    compareTokens('parameter and protocol identifiers', source, translated, /\b[A-Z][A-Z0-9]*_[A-Z0-9_*]+(?=s?\b)/g, location);
  }
}

if (fs.existsSync(path.join(locales, 'ru'))) {
  for (const file of fs.readdirSync(path.join(locales, 'ru')).filter((name) => name.endsWith('.json'))) {
    if (!files.includes(file)) problems.push(`${file}: namespace absent from English`);
  }
}

for (const problem of problems) console.error(problem);
console.log(`Russian: ${files.length} namespaces, ${strings} strings, ${pluralGroups} plural groups, ${problems.length} problems.`);
console.log(`${identical} values match English; technical names and units need manual review.`);
process.exitCode = problems.length ? 1 : 0;
