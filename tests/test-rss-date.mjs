import {strict as assert} from 'node:assert';
import {normalizeSourceDate} from '../src/features/discovery/rss-date.js';
assert.equal(normalizeSourceDate('Mon, 19 Oct 2026 18:51:31 +0000'),'2026-10-19T18:51:31.000Z');
assert.equal(normalizeSourceDate('Fri, 16 Oct 2026 06:08:05 +0300'),'2026-10-16T03:08:05.000Z');
assert.equal(normalizeSourceDate('2026-10-22T21:03:00Z'),'2026-10-22T21:03:00.000Z');
assert.equal(normalizeSourceDate(1792700000),'2026-10-22T20:13:20.000Z');
assert.equal(normalizeSourceDate('garbage'),'');
console.log('PASS RSS UTC+3 and GMT dates convert to SQLite ISO');
