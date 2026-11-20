import {strict as assert} from "node:assert";
import {chooseActionableReview,renderActionableReview} from "../src/features/jobs/actionable-review.js";
const a={id:"a",title:"AI Automation Engineer / n8n Developer",source:"Djinni · Node.js",
 url:"https://djinni.co/jobs/854363-ai-automation-engineer-n8n-developer/",score:82,
 state:"filtered",kind:"buyer",geo:"allowed",engagement:"fulltime",
 reason:"Релевантна роль API, webhooks, LLM та автоматизація",region:"",
 description:"AI automation for actual customers",discovered_at:"2026-10-23T00:00:00Z"};
const b={...a,id:"b",score:85,geo:"unknown",engagement:"unknown",
 url:"https://djinni.co/jobs/854319-integrations-engineer/",title:"Integrations Engineer"};
const c={...a,id:"c",score:99,source:"Freelance.ua · Програмування",
 url:"https://freelance.ua/orders/123"};
const d={...a,id:"d",score:99,geo:"restricted",url:"https://djinni.co/jobs/854000"};
const e={...a,id:"e",score:99,description:"USA only",url:"https://djinni.co/jobs/854001"};
const f={...a,id:"f",score:99,alerted_at:"2026-10-23T00:00:00Z",url:"https://djinni.co/jobs/854002"};
const g={...a,id:"g",score:98,source:"Reddit r/forhire",
 url:"https://www.reddit.com/r/forhire/comments/100/"};
const h={...a,id:"h",score:98,title:"Banking background required",
 url:"https://djinni.co/jobs/854555-banking/"};
const t=chooseActionableReview([a,b,c,d,e,f,g,h],[],3);
assert.equal(t.length,2);
assert.deepEqual(new Set(t.map(x=>x.id)),new Set(["a","b"]));
assert.deepEqual(chooseActionableReview([a,b],[a.id],3).map(x=>x.id),["b"]);
const msg=renderActionableReview(t);
assert(msg.includes("НЕ підтверджені"));
assert(msg.includes("30 год/тиждень"));
assert(msg.includes("не підтверджена"));
assert(!msg.includes("Freelance.ua"));
assert(msg.length<3900);
console.log("PASS source/paywall limits, country labels, manual job selection and repeat filtering");
