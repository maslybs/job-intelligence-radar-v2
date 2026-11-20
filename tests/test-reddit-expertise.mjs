import {strict as assert} from "node:assert";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {EXPERTISE_LANES,EXPERTISE_QUALIFICATION_HINT,focusedRedditTargets} from "../src/features/reddit/reddit-expertise.js";

assert.deepEqual(EXPERTISE_LANES,RADAR_SETTINGS.reddit.expertiseLanes);
const rows=focusedRedditTargets(),ids=rows.map(x=>x.id);
assert.equal(new Set(ids).size,rows.length,"no duplicate targets");
for(const x of rows)assert(x.term.length<120 && x.id.length<160);
assert(!rows.some(x=>/technical cofounder|learnprogramming|equity only/i.test(x.term)));
if(RADAR_SETTINGS.reddit.expertiseLanes.length) {
  const first=RADAR_SETTINGS.reddit.expertiseLanes[0];
  assert(rows.some(x=>x.kind==="sub" && x.term===first.subs[0]));
  assert(EXPERTISE_QUALIFICATION_HINT.includes(RADAR_SETTINGS.leads.profile.provenDeliveries[0]));
} else {
  assert.equal(rows.length,RADAR_SETTINGS.reddit.strongShortQueries.length);
}
console.log("PASS profile-backed Reddit discovery",EXPERTISE_LANES.length,"lanes,",rows.length,"unique targets");
