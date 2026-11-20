import {strict as assert} from "node:assert";
import {redditTargetKinds,redditTargetUrl} from "../src/features/reddit/reddit-adaptive.js";
const fiveMinute=5*60*1000;
const rotation=Array.from({length:10},(_,i)=>redditTargetKinds(1,i*fiveMinute)[0]);
assert.equal(rotation.filter(x=>x==="sub").length,7,"70% subreddits");
assert.equal(rotation.filter(x=>x==="subquery").length,2,"20% scoped problems");
assert.equal(rotation.filter(x=>x==="query").length,1,"10% broad queries");
assert.deepEqual(redditTargetKinds(2,fiveMinute),["subquery","sub"]);
assert.deepEqual(redditTargetKinds(2,2*fiveMinute),["sub","sub"]);
assert.equal(redditTargetUrl({kind:"subquery",term:"n8n::workflow failing"}),
 "https://www.reddit.com/r/n8n/search/?q=workflow%20failing&restrict_sr=1&sort=new&t=week&type=posts");
assert.throws(()=>redditTargetUrl({kind:"subquery",term:"../../../secret::bad"}));
console.log("PASS bounded Reddit rotation and subreddit-scoped search URLs");
