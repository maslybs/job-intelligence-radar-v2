import {strict as assert} from "node:assert";
import {settleIndependentPipelines} from "../src/features/scheduler/pipeline-isolation.js";
const calls=[];
const results=await settleIndependentPipelines([
 async()=>{calls.push("upwork_started");throw new Error("Upwork unavailable");},
 async()=>{calls.push("other_started");calls.push("other_completed");return {inserted:3,source:"Djinni"};},
 async()=>{calls.push("reddit_started");return {inserted:1,source:"Reddit"};}
]);
assert.equal(results[0].status,"rejected");
assert.equal(results[1].status,"fulfilled");
assert.equal(results[1].value.inserted,3);
assert.equal(results[2].status,"fulfilled");
assert(calls.includes("other_completed"),"healthy sources must run even when Upwork fails");
console.log("PASS: independent Upwork/other/Reddit stages survive isolated failure");
