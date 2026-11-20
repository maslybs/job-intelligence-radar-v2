import {strict as assert} from "node:assert";
import {fairDeliveryBatch} from "../src/features/scheduler/pipeline-isolation.js";
const make=(source,n)=>Array.from({length:n},(_,i)=>({source,id:i}));
const rows=[...make("Upwork · Opportunities",9),...make("Freelancehunt · AI",2),...make("Reddit r/n8n",2),...make("Community · n8n",2),...make("Djinni · Node.js",2)];
const picked=fairDeliveryBatch(rows,8);
assert.equal(picked.length,8);
for(const prefix of ["Upwork","Freelancehunt","Reddit","Community","Djinni"])assert(picked.some(x=>x.source.startsWith(prefix)),prefix);
assert.equal(fairDeliveryBatch(make("Upwork",15),8).length,8);
console.log("PASS fair source distribution and 8-item limit");