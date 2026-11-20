import {classifyEvidence} from '../src/features/ai/opportunity-intelligence.js';
const make=(title,description)=>({id:"1",source:"Community · Example",title,description,url:"https://example.org/posts/321905",region:"",published_at:"2026-10-21"});
const cases=[
 ["Splunk informational",make("Recommended Splunk capabilities","I am configuring n8n to read Splunk. What capabilities are needed?"),
  {channel:"B",commercial_intent:"operational_blocker",need_quote:"I am configuring n8n to read Splunk"}, "hypothesis"],
 ["Partner introduction no clients",make("Partner", "We're looking to connect with n8n implementers. No client project yet."),
  {channel:"A",commercial_intent:"indirect",need_quote:"looking to connect with n8n implementers"},"hypothesis"],
 ["Explicit subcontract request",make("Agency paid implementer","Our agency sells automation. Need a freelance backend engineer for client projects. Pay $50/hr."),
  {channel:"A",commercial_intent:"explicit_paid",need_quote:"Need a freelance backend engineer for client projects",budget_quote:"Pay $50/hr"},"manual_review"],
 ["Invented budget",make("Agency builder","Need a freelance backend engineer for client projects. Payment to be discussed."),
  {channel:"A",commercial_intent:"explicit_paid",need_quote:"Need a freelance backend engineer for client projects",budget_quote:"$2000"},"manual_review"],
 ["Polish must have",make("Agency builder","Need a freelance engineer for customer API setup. Budget $2000. Must speak Polish fluently."),
  {channel:"D",commercial_intent:"explicit_paid",need_quote:"Need a freelance engineer for customer API setup",budget_quote:"Budget $2000",critical_gap_quote:"Must speak Polish fluently"},"manual_review"],
 ["Equity only",make("Equity role","Need a backend engineer for product. Equity only. Compensation discussed."),
  {channel:"D",commercial_intent:"seeks_contractor",need_quote:"Need a backend engineer for product",blocker_quote:"Equity only"},"reject"],
 ["Corporate growth",make("CRM growth","We are expanding our HubSpot sales department and seeking new customers."),
  {channel:"C",commercial_intent:"indirect",need_quote:"We are expanding our HubSpot sales department"},"hypothesis"]
];
let fails=0;
for(const [name,job,model,expect] of cases){
 const x=classifyEvidence(job,model);
 const valid=x.stage===expect;
 console.log(valid?"PASS":"FAIL",name,x.stage,x.reason,JSON.stringify(x.evidence));
 if(!valid)fails++;
}
if(fails)process.exit(1);
