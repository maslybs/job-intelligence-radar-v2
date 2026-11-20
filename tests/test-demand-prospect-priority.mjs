import {strict as assert} from "node:assert";
import {selectProspectTriage,prospectPriorityScore} from "../src/features/prospects/prospect-priority.js";
import {chooseManualLeads,renderManualLeads} from "../src/features/delivery/manual-lead-digest.js";
const s=[
{id:"p",source:"Reddit r/smallbusiness",title:"Looking for a developer to connect QuickBooks and our shop",description:"Our business loses orders from broken synchronization."},
{id:"f",source:"Community · n8n",title:"We need someone to fix CRM webhook and client followups",description:"Our company CRM is broken and customers leave."},
{id:"noise",source:"Community · Cloudflare",title:"How do I learn about API docs?",description:"I am a student doing a tutorial on API configuration"},
{id:"r",source:"Reddit r/SaaS",title:"Our paid SaaS customer onboarding breaks",description:"We are losing customers due to a broken integration."},
{id:"c2",source:"Community · n8n",title:"Can't sync Shopify orders to QuickBooks",description:"Our business inventory is broken and our sales team is spending hours on this"},
{id:"c3",source:"Community · n8n",title:"Our business Shopify webhooks broken",description:"Our company inventory is broken and customer orders fail"},
{id:"c4",source:"Community · n8n",title:"Our company CRM workflows are broken",description:"Our customers have missing invoice entries"}
];
assert(prospectPriorityScore(s[0])>prospectPriorityScore(s[2]));
const picked=selectProspectTriage(s,5);
assert(picked.some(x=>x.id==="p"));
assert(picked.some(x=>x.id==="r"));
assert(picked.filter(x=>x.source==="Community · n8n").length<=3);
assert(!picked.some(x=>x.id==="noise"),"generic question should not take a slot when better leads exist");
const lead={id:"a",source:"Reddit r/SaaS",title:"Our customers cannot complete onboarding",url:"https://www.reddit.com/r/SaaS/comments/abc/",category:"business_problem",commercial_intent:"commercial_blocker",fit:88,commercial_score:65,business_signal:1,payment_confirmed:0,kind:"unclear",geo:"unknown",buyer_evidence_uk:"Автор керує B2B SaaS із платними клієнтами та описує реальні проблеми.",problem_uk:"Більшість клієнтів не завершують налаштування B2B SaaS.",solution_uk:"Проаналізувати воронку та реалізувати покрокову активацію клієнтів.",review_status:null};
assert.equal(chooseManualLeads([lead]).length,1);
assert.equal(chooseManualLeads([{...lead,review_status:"answered"}]).length,0);
assert.equal(chooseManualLeads([{...lead,commercial_score:20}]).length,0);
assert.equal(chooseManualLeads([{...lead,category:"self_promotion"}]).length,0);
assert.equal(chooseManualLeads([{...lead,geo:"restricted"}]).length,0);
assert.equal(chooseManualLeads([{...lead,title:"B2B app developer wanted for equity 5-10%"}]).length,0);
assert.equal(chooseManualLeads([{...lead,source:"Reddit r/FreelanceIndia"}]).length,0);
assert.equal(chooseManualLeads([{...lead,source:"Reddit r/FreelanceIndia",title:"Global applicants worldwide for B2B integration"}]).length,1);
const digest=renderManualLeads([lead],"2026-10-23");
assert(digest.includes("НЕ підтверджені вакансії"));
assert(digest.includes("не підтверджені або недоступні"));
assert(digest.length<3900);
console.log("PASS: buyer-first balanced triage and transparently unverified demand watchlist");
