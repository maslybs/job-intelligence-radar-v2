import {strict as assert} from "node:assert";
import {nextRedditThreadReview} from "../src/features/reddit/reddit-thread-review.js";
import {pickRedditTargets,redditTargetKinds} from "../src/features/reddit/reddit-adaptive.js";
let sql="";
const env={DB:{prepare(stmt){
 if(stmt.startsWith("SELECT j.id,j.title"))sql=stmt;
 return {bind(){return this},async all(){return {results:[]}},async run(){return {meta:{changes:1}}},async first(){return null}};
}}};
await nextRedditThreadReview(env);
assert(sql.includes("LEFT JOIN reddit_prospects"));
assert(sql.includes("AND p.business_signal=1"));
assert(sql.includes("AND (r.job_id IS NULL"),"review status applies to all branches");
// Keep tests read-only; production SQL is checked in memory.
const testNow=Date.now();
const candidates=[
{id:"sub:saas",kind:"sub",term:"SaaS",family:"community",tries:10,pages_ok:5,demand_hits:4,confirmed_hits:0,
 qualified:0,unique_hits:8,technical_signals:30,buyer_signals:8,errors:0},
{id:"sub:webdeveloperjobs",kind:"sub",term:"WebDeveloperJobs",family:"community",tries:10,pages_ok:5,demand_hits:0,confirmed_hits:0,
 qualified:8,unique_hits:16,technical_signals:140,buyer_signals:20,errors:0}
];
const pickEnv={DB:{prepare(stmt){
 return {bind(){return this},async all(){return {results:candidates}}};
}}};
const oldRand=Math.random;
Math.random=()=>0.5;
try{
 const chosen=await pickRedditTargets(pickEnv,1);
 assert.equal(chosen[0].term,"SaaS","verified business problems outrank generic job boards");
}finally{Math.random=oldRand}
assert.deepEqual(redditTargetKinds(1,0),["query"]);
assert.deepEqual(redditTargetKinds(1,300000),["subquery"]);
assert.deepEqual(redditTargetKinds(1,600000),["sub"]);
const rotation=Array.from({length:10},(_,i)=>redditTargetKinds(1,i*300000)[0]);
assert.equal(rotation.filter(x=>x==="sub").length,7);
assert.equal(rotation.filter(x=>x==="subquery").length,2);
assert.equal(rotation.filter(x=>x==="query").length,1);
console.log("PASS Reddit SQL captured, business pain beats job boards, single-page query rotation");
