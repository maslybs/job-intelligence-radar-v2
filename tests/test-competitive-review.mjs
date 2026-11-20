import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {strict as assert} from "node:assert";
import {highFitFresh} from "../src/features/jobs/competitive-review.js";
const now=Date.parse("2026-10-26T22:12:00Z");
const job={title:"Business process automation request",score:82,engagement:"contract",geo:"allowed",published_at:"2026-10-26T17:19:00Z"};
const matchingSkill=RADAR_SETTINGS.jobs.profile.skills.find(x=>String(x).length>=3)||
 RADAR_SETTINGS.jobs.criteria.includeKeywords.find(x=>String(x).length>=3);
assert(matchingSkill,"the example profile must contain one searchable skill");
assert(highFitFresh({...job,title:matchingSkill+" paid integration"},21,now));
assert(highFitFresh({...job,title:matchingSkill+" consulting project"},23,now));
assert(!highFitFresh(job,44,now));
assert(!highFitFresh({...job,score:78},21,now));
assert(!highFitFresh({...job,published_at:"2026-10-25T10:00:00Z"},21,now));
assert(!highFitFresh({...job,title:"Landing page design"},21,now));
assert(!highFitFresh({...job,geo:"restricted"},21,now));
console.log("PASS selective high-bid exception keeps only recent high-fit contracts");
