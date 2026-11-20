import { strict as assert } from "node:assert";
import {upworkLocationEligibility} from "../src/integrations/upwork/upwork-location.js";
import {upworkCompetitionDecision} from "../src/integrations/upwork/upwork-competition.js";
import {renderJobTelegram} from "../src/features/delivery/job-message.js";
const syntheticApplicant={jobs:{profile:{country:"Japan"},criteria:{allowedRegions:["Japan"]}}};
const geo=[
 ["US-only",{description:"This job is US-based only, must live in United States"},false],
 ["EU-only",{description:"Applicants must be in the EU only"},false],
 ["US citizen",{description:"US citizenship required"},false],
 ["W-2",{description:"W2 only, no overseas contractors"},false],
 ["US-only screening",{description:"Remote opportunity",screening_questions:["Are you a US resident? This role requires US residents only"]},false],
 ["client location not restriction",{description:"Our client is in the United States. We are remote and international."},true],
 ["US timezone not restriction",{description:"Working with EST and PST time zones is preferred."},true],
 ["country whitelist",{description:"Remote",freelancer_preferences:{allowedCountries:["United States","Canada"]}},false],
 ["Matching country whitelist",{description:"Remote",freelancer_preferences:{allowedCountries:["Japan","Poland"]}},true],
];
for(const [name,input,expected] of geo) assert.equal(upworkLocationEligibility(input,syntheticApplicant).eligible,expected,name);
assert.equal(upworkLocationEligibility({description:"US-based only"},{jobs:{profile:{country:"United States"},criteria:{allowedRegions:[]}}}).eligible,true,"configured US applicant");
assert.equal(upworkLocationEligibility({description:"EU only"},{jobs:{profile:{country:"Germany"},criteria:{allowedRegions:[]}}}).eligible,true,"actual EU residence");
const now=Date.parse("2026-10-22T13:55:00Z");
const base={published_at:"2026-10-22T12:20:00Z",first_seen_at:"2026-10-22T12:35:00Z",last_seen_at:"2026-10-22T13:45:00Z",first_upper:10,last_upper:10,previous_upper:10,previous_seen_at:"2026-10-22T12:35:00Z",samples:2};
const verdict=(changes={},moment=now)=>upworkCompetitionDecision({...base,...changes},moment);
assert.equal(verdict().eligible,true,"stable low competition");
assert.equal(verdict({published_at:"2026-10-22T13:35:00Z"}).eligible,false,"freshness");
assert.equal(verdict({samples:1}).eligible,false,"needs second observation");
assert.equal(verdict({last_upper:50}).eligible,false,"rapid growth to 50");
assert.equal(verdict({last_upper:1000}).eligible,false,"50+ tier");
assert.equal(verdict({last_upper:999}).eligible,false,"unknown proposal count");
assert.equal(verdict({last_seen_at:"2026-10-22T12:35:00Z"}).eligible,false,"stale");
const m=renderJobTelegram({source:"Upwork · Opportunities",title:"Build API and RAG <script>",company:"Upwork · USA",geo:"allowed",score:89,engagement:"contract",state:"unread",url:"https://www.upwork.com/jobs/~0221",published_at:"2026-10-22T12:00:00Z",description:"Upwork marketplace. Proposals: 5 to 10. Budget: $1000. Client spent: $2000. Client freelancer rating: 5. <untrusted_participant_content>Need custom RAG and API integration</untrusted_participant_content>",reason:"Strong API and integration experience"},{tasks_uk:"Побудувати API і RAG; інтегрувати з продуктом",requirements_uk:"Node.js, Python",risks_uk:"Уточнити вимоги до бюджету"});
assert(m.startsWith("<b>🟢"),"clear header");
assert(m.includes("🎯")&&m.includes("🛠")&&m.includes("💡")&&m.includes("🌍")&&m.includes("👥"),"sections");
assert(!m.includes("<script>"),"safe HTML");
assert(m.length<3900,"Telegram limit");
console.log("PASS: location 9 cases, competition 7 cases, Telegram format+escape");
