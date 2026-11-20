import {strict as assert} from "node:assert";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {assessExistingRedditProspects} from "../src/features/prospects/prospect-intelligence.js";
import {aiBudgetState,reserveAiBudget} from "../src/platform/ai-budget.js";
function fakeD1(initial=null){
 let usage=initial;
 return {
  prepare(sql){
   let params=[];
   return {
    bind(...values){params=values;return this;},
    async first(){
     if(sql.startsWith("SELECT used,prospect_used"))return usage?{used:usage.used,prospect_used:usage.prospect_used}:null;
     if(sql.startsWith("SELECT value FROM meta"))return null;
     throw Error("unexpected SELECT "+sql);
    },
    async run(){
     if(sql.startsWith("CREATE TABLE"))return {meta:{changes:0}};
     if(sql.startsWith("INSERT OR IGNORE INTO ai_budget_usage")){
      if(usage)return {meta:{changes:0}};
      usage={day:params[0],used:params[1],prospect_used:params[2]};
      return {meta:{changes:1}};
     }
     if(sql.startsWith("UPDATE ai_budget_usage")){
      const [units,prospect,day,required,limit,pRequired,prospectLimit]=params;
      if(usage.day===day&&usage.used+required<=limit&&usage.prospect_used+pRequired<=prospectLimit){
       usage.used+=units;usage.prospect_used+=prospect;return {meta:{changes:1}};
      }
      return {meta:{changes:0}};
     }
     throw Error("unexpected mutation "+sql);
    }
   };
  }
 };
}
const day="2026-11-20",env={DB:fakeD1()};
const cap=RADAR_SETTINGS.ai.dailyEvaluationLimit,chunk=Math.max(1,Math.ceil(cap/10));
const result=await Promise.all(Array.from({length:35},()=>reserveAiBudget(env,{day,units:chunk})));
const state=await aiBudgetState(env,day);
assert.equal(result.filter(Boolean).length,Math.floor(cap/chunk));
assert.equal(state.used,Math.floor(cap/chunk)*chunk);
assert(state.used<=cap);
assert.equal(await reserveAiBudget(env,{day,units:cap-state.used+1}),false);
const prospect={DB:fakeD1()},pLimit=RADAR_SETTINGS.ai.dailyProspectLimit;
const requests=await Promise.all(Array.from({length:pLimit+3},()=>reserveAiBudget(prospect,{day,kind:"prospect"})));
assert.equal(requests.filter(Boolean).length,pLimit);
const pState=await aiBudgetState(prospect,day);
assert.equal(pState.prospectUsed,pLimit);
assert.equal(await reserveAiBudget(prospect,{day,kind:"prospect"}),false);
if(RADAR_SETTINGS.leads.enabled){
 const full={DB:fakeD1({day,used:cap,prospect_used:0}),AI:{run(){throw Error("AI called after shared limit exhausted")}}};
 const outcome=await assessExistingRedditProspects(full,{model:"fake-model",day,limit:7});
 assert.equal(outcome.state,"daily_ai_budget_exhausted");
}
console.log("PASS atomic shared D1 AI limit and prospect triage quota enforcement");
