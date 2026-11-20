import assert from "node:assert/strict";
import {matchesGeneralistOutcome,opportunityTrack} from "../src/features/jobs/job-strategy.js";
import {upworkCompetitionDecision} from "../src/integrations/upwork/upwork-competition.js";
import {renderJobTelegram} from "../src/features/delivery/job-message.js";
const desc="We want one engineer to own our SaaS integration from requirements through launch and post-release fixes; B1 English for written updates is fine.";
const syntheticSettings={jobs:{profile:{role:"Software Consultant",skills:["API","CRM","SaaS"]},
 criteria:{preferredRoles:["Founding Engineer","Product Engineer","AI Solutions Engineer"],
 includeKeywords:["integration","workflow"]}}};
const testOutcome=job=>matchesGeneralistOutcome(job,syntheticSettings);
assert(testOutcome({title:"Product Engineer",description:desc}),"outcome-first product engineer without stack keywords");
for (const title of ["Founding Engineer", "Founding Full Stack Engineer", "Founding Fullstack Engineer", "Founding Full-Stack Engineer", "Founding Software Engineer", "Founding Product Engineer"]) {
 assert(testOutcome({title,description:""}),`founding title must reach review: ${title}`);
}
assert(!testOutcome({title:"Founding Sales Executive",description:""}),"nontechnical founding title must not match");
assert(testOutcome({title:"AI Solutions Engineer",description:desc}),"solutions role");
assert(testOutcome({title:"Build our internal CRM workflow",description:desc}),"outcome-based practical work");
assert(!testOutcome({title:"Professor of Organic Chemistry",description:"Research role with no software engineering."}),"unrelated");
assert.equal(opportunityTrack({title:"Product Engineer",source:"Upwork · Opportunities",engagement:"contract"}),"project");
assert.equal(opportunityTrack({title:"Automation Consultant at Integration Agency",source:"Djinni"}),"agency");
const now=Date.parse("2026-10-24T12:00:00Z");
const base={published_at:new Date(now-3*3600000).toISOString(),first_seen_at:new Date(now-110*60000).toISOString(),previous_seen_at:new Date(now-45*60000).toISOString(),last_seen_at:new Date(now-5*60000).toISOString(),samples:3,first_upper:49,previous_upper:49,last_upper:49};
const moderate=upworkCompetitionDecision(base,now);
assert.equal(moderate.eligible,true,"20-49 proposals should reach AI review after fresh stable observations");
assert.equal(moderate.reason,"stable_moderate_competition");
assert.equal(upworkCompetitionDecision({...base,last_upper:50},now).eligible,false,"50+ proposals excluded");
assert.equal(upworkCompetitionDecision({...base,last_upper:1000},now).eligible,false,"more than 50 proposals excluded");
assert.equal(upworkCompetitionDecision({...base,samples:1},now).eligible,false,"unverified snapshot blocked");
const job={title:"Product Engineer",source:"Djinni · Product Engineer",description:desc,region:"Remote",url:"https://example.org/job",score:86,reason:"Відповідає підтвердженим задачам",engagement:"fulltime",geo:"unknown",published_at:new Date(now).toISOString()};
const telegram=renderJobTelegram(job,{}, {track:"employment",interview_risk:"high",risks:"Умови співбесіди слід уточнити",conditions:"Зарплата не вказана"});
assert.match(telegram,/ДОВГОСТРОКОВА ВАКАНСІЯ/);
assert.match(telegram,/Перевірити географічну доступність/);
assert.match(telegram,/високий/);
assert.match(telegram,/Зарплата не вказана/);
assert.match(telegram,/Відкрити оригінал/);
console.log("strategy_funnel PASS");
