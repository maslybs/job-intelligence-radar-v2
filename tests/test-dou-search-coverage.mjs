import {strict as assert} from "node:assert";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {DOU_SEARCH_TARGETS,douBatch,douSearchUrl} from "../src/features/dou/dou-browser-source.js";
const expected=RADAR_SETTINGS.jobs.browserSources.dou.targets;
assert.deepEqual(DOU_SEARCH_TARGETS,expected,"no hardcoded personal DOU targets");
const ids=DOU_SEARCH_TARGETS.map(x=>x.id);
assert.equal(new Set(ids).size,ids.length);
const visited=new Set();
for(let slot=0;slot<Math.max(1,Math.ceil(ids.length/2));slot++){
 for(const target of douBatch(slot,2)){
  visited.add(target.id);
  assert(douSearchUrl(target).startsWith("https://jobs.dou.ua/vacancies/?search="));
 }
}
assert.equal(visited.size,ids.length,"all configured search phrases visited by rotation");
if(ids.length)assert.equal(douBatch(ids.length,2)[0].id,douBatch(0,2)[0].id,"rotation wraps");
console.log("PASS configured DOU targets, unique identifiers and bounded deterministic rotation",ids.length);