import {strict as assert} from "node:assert";
import {upworkCompetitionDecision,proposalTierUpper} from "../src/integrations/upwork/upwork-competition.js";
import {releaseRadarOwnedTab,radarSessionTabs,closeRadarSessionTabs} from "../src/features/reddit/reddit-tab-lifecycle.js";
const observed=(published_at,first_seen_at,last_seen_at,first_upper,last_upper,samples=2)=>({published_at,first_seen_at,last_seen_at,first_upper,last_upper,samples,previous_upper:first_upper,previous_seen_at:first_seen_at});
const now=Date.parse("2026-10-22T16:05:00Z");
const infamous=observed("2026-10-22T14:57:34.609Z","2026-10-22T15:02:09.662Z","2026-10-22T16:04:08.403Z",4,1000);
assert.equal(upworkCompetitionDecision(infamous,now).eligible,false,"50+ must be rejected");
assert.equal(upworkCompetitionDecision({...infamous,last_seen_at:"2026-10-22T15:02:09.662Z",last_upper:4,samples:1},Date.parse("2026-10-22T15:04:02Z")).eligible,false,"6-minute listing must never be delivered");
const published="2026-10-22T14:30:00Z";
const first="2026-10-22T14:32:00Z";
const second="2026-10-22T16:00:00Z";
const stable=observed(published,first,second,4,4);
assert.equal(upworkCompetitionDecision(stable,now).eligible,true,"genuine stable low competition can pass");
assert.equal(upworkCompetitionDecision({...stable,last_upper:10},now).eligible,false,"recent 5-10 growth still blocked");
const plateau={...stable,last_upper:10,previous_upper:10,previous_seen_at:"2026-10-22T15:20:00Z",samples:3};
assert.equal(upworkCompetitionDecision(plateau,now).eligible,true,"historical growth then stable 5-10 allowed");
assert.equal(upworkCompetitionDecision({...plateau,previous_upper:4},now).eligible,false,"current increase blocked");
assert.equal(upworkCompetitionDecision({...plateau,previous_upper:null},now).eligible,false,"missing recent baseline blocked");
assert.equal(upworkCompetitionDecision({...stable,last_upper:15},now).eligible,false,"10-15 rejected");
assert.equal(upworkCompetitionDecision({...stable,last_upper:50},now).eligible,false,"20-50 rejected");
assert.equal(upworkCompetitionDecision({...stable,samples:1},now).eligible,false,"single snapshot rejected at any age");
assert.equal(upworkCompetitionDecision({...stable,last_seen_at:"2026-10-22T15:00:00Z"},now).eligible,false,"stale rejected");
assert.equal(upworkCompetitionDecision({...stable,previous_seen_at:"2026-10-22T15:50:00Z"},now).eligible,false,"missing recent trend rejected");
assert.equal(upworkCompetitionDecision({...stable,last_upper:999},now).eligible,false,"unknown rejected");
assert.equal(upworkCompetitionDecision(null,now).eligible,false,"missing record rejected");
assert.equal(proposalTierUpper("20 to 50"),50);
assert.equal(proposalTierUpper("Fewer than 5"),4);
const calls=[];
const mock=async (env,kind,tool,args,connection)=>{calls.push({kind,tool,args});return {ok:true,closed:args.close}};
await releaseRadarOwnedTab({}, {session_id:"cloudflare-job-radar-reddit",handle:"tab_123_foo"}, {},mock);
assert.equal(calls.length,1);
assert.equal(calls[0].tool,"chrome-extension-gateway::browser.release_tab");
assert.equal(calls[0].args.close,true);
assert.equal(calls[0].args.handle,"tab_123_foo");
await releaseRadarOwnedTab({}, {session_id:"unrelated",handle:"tab_456_bar"}, {},mock);
assert.equal(calls.length,1,"other sessions never closed");
await releaseRadarOwnedTab({}, {session_id:"cloudflare-job-radar-reddit",tab_id:1234}, {},mock);
assert.equal(calls.length,2,"numeric tab id fallback");
const state={result:{agent_tabs:[
 {session_id:"cloudflare-job-radar-reddit",origin:"agent",handle:"tab_99_reddit"},
 {session_id:"different-agent",origin:"agent",handle:"tab_88_other"},
 {session_id:"cloudflare-job-radar-reddit",origin:"user",handle:"tab_77_user"}
 ]}};
assert.deepEqual(radarSessionTabs(state),[{session_id:"cloudflare-job-radar-reddit",handle:"tab_99_reddit"}]);
const sweepCalls=[];
const stateHub=async(env,method,tool,args)=>{
 if(method==="hub_read")return state;
 sweepCalls.push({method,tool,args});
 return {closed:true};
};
const sweep=await closeRadarSessionTabs({}, {},stateHub);
assert.equal(sweep.closed,1);
assert.equal(sweepCalls.length,1);
assert.equal(sweepCalls[0].args.handle,"tab_99_reddit");
assert.equal(sweepCalls[0].args.close,true);
console.log("PASS competition, Reddit session-scoped release and orphan cleanup without touching user tabs");
