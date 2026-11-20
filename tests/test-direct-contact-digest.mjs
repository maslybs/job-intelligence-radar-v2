import {strict as assert} from "node:assert";
import {selectDirectContactJobs,renderDirectContactJobs} from "../src/features/delivery/direct-contact-digest.js";
const x={id:"w",title:"Freelance WordPress backend API integrations",url:"https://jobs.wordpress.net/job/remote-api/",source:"WordPress Jobs · Direct Contact",kind:"buyer",geo:"unknown",score:82,state:"filtered",engagement:"fulltime",description:"REST API PHP and WooCommerce integrations",region:"N/A",reason:"Clarify weekly hours",discovered_at:"2026-10-22T22:00:00Z"};
const y={...x,id:"b",url:"https://forum.bubble.io/t/ai-saas/100",title:"AI SaaS paid milestone",source:"Bubble · Jobs / Freelance",score:88};
const synthetic={jobs:{directContactSources:[{name:x.source,allowedHosts:["jobs.wordpress.net"]},{name:y.source,allowedHosts:["forum.bubble.io"]}]}};
const result=selectDirectContactJobs([x,y,{...x,id:"z",url:"https://jobs.wordpress.net/job/onsite/",region:"Taipei"},{...x,id:"f",url:"https://freelance.ua/orders/123",source:"Freelance.ua"}],3,synthetic);
assert.equal(result.length,2);assert.equal(result[0].id,"b");
const html=renderDirectContactJobs(result,"2026-10-23");assert(html.includes("без платного тарифу")&&html.includes("не підтверджена"));
console.log("PASS direct contact source whitelist, geography, concise truthful Telegram");
