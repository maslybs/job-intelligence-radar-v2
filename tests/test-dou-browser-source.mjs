import {strict as assert} from "node:assert";
import {canonicalDouVacancy,extractDouListings,extractDouJobDetail,douBatch,douLeadLane,douSearchUrl,DOU_SEARCH_TARGETS} from "../src/features/dou/dou-browser-source.js";
const good="https://jobs.dou.ua/companies/4bill-io/vacancies/375014/?utm_source=chatgpt.com";
assert.equal(canonicalDouVacancy(good)?.url,"https://jobs.dou.ua/companies/4bill-io/vacancies/375014/");
assert.equal(canonicalDouVacancy("https://evil.site/companies/4bill-io/vacancies/375014/"),null);
assert.equal(canonicalDouVacancy("https://jobs.dou.ua/vacancies/?search=x"),null);
const snap={title:"Вакансії за запитом AI Automation | DOU",url:"https://jobs.dou.ua/vacancies/?search=AI%20Automation",
bodyText:"6 вакансій за запитом «AI Automation»",
nodes:[
{href:good,text:"AI Automation Specialist в 4bill — n8n Python SQL LLM"},
{href:"https://jobs.dou.ua/companies/spendbase/vacancies/487123/",text:"Junior AI Automation Engineer"},
{href:"https://jobs.dou.ua/companies/4bill-io/vacancies/375014/",text:"AI Automation Specialist"},
{href:"https://evil.site/companies/anything/vacancies/123/",text:"Malicious"}]};
const x=extractDouListings(snap,"AI Automation");
assert.equal(x.state,"ok");
assert.equal(x.items.length,2);
assert(x.items.some(i=>i.url.includes("375014")));
const detail=extractDouJobDetail({title:"AI Automation Specialist | 4bill",bodyText:"Python n8n Make SQL RAG API. ".repeat(45)+"Remote work, full-time and salary USD 2000-3000."},good);
assert.equal(detail.state,"ok");
assert.equal(detail.location_mode,"remote");
assert.equal(detail.employment,"fulltime");
assert.equal(extractDouJobDetail({bodyText:"Access denied 403 forbidden"},good).state,"blocked");
assert.equal(douBatch(0,2).length,2);
assert.equal(new Set([...douBatch(0,2),...douBatch(1,2)].map(t=>t.id)).size,Math.min(4,DOU_SEARCH_TARGETS.length));
assert.equal(douLeadLane({title:"API integration contractor for an agency"}),"agency_subcontract");
assert.equal(douLeadLane({title:"Part-time AI Engineer"}),"fractional_employment");
assert(douSearchUrl(douBatch(0,1)[0]).startsWith("https://jobs.dou.ua/vacancies/?search="));
console.log("PASS DOU public DOM ingestion, exact host, age-agnostic current listings, lead channels, anti-blocking");
