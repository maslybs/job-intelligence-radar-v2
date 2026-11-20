import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {backendBoardJobs} from '../src/features/discovery/remote-backend-source.js';
const a=JSON.parse(readFileSync('tests/fixtures/backendjobs-audit.json','utf8'));const result=backendBoardJobs(a,'Remote Backend Jobs · Global',Date.parse('2026-10-23T07:00:00Z'));assert(result.length>0);assert(result.every(x=>x.url.startsWith('https://www.remotebackendjobs.com/')));assert(result.every(x=>/Worldwide|Europe|EMEA/i.test(x.region)));console.log('PASS backend source',result.length);
