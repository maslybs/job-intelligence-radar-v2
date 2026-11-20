import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Public DOU vacancy listings observed through an agent-owned browser tab.
// This module never guesses a publication date or treats a closed detail URL
// as evidence the vacancy is still open; only search-result links qualify.
const HOST="jobs.dou.ua";
export function canonicalDouVacancy(raw){
 try{
  const u=new URL(String(raw||""),"https://"+HOST);
  if(u.protocol!=="https:"||u.hostname!==HOST)return null;
  const m=u.pathname.match(/^\/companies\/([a-z0-9_-]+)\/vacancies\/(\d+)\/?$/i);
  return m?{url:"https://"+HOST+"/companies/"+m[1]+"/vacancies/"+m[2]+"/",companySlug:m[1],number:m[2]}:null;
 }catch{return null}
}
export function extractDouListings(page,search,now=new Date()){
 const rawNodes=Array.isArray(page?.nodes)?page.nodes:
   Array.isArray(page?.nodes?.items)?page.nodes.items.map(x=>x.value):[];
 const text=typeof page?.bodyText==="string"?page.bodyText:"";
 const title=String(page?.title||"");
 const access=(title+"\n"+text.slice(0,950)).toLowerCase();
 if(/(?:access denied|403 forbidden|attention required|verify you are human|captcha|just a moment)/i.test(access))
   return {state:"blocked",items:[],checked:0};
 if(!/jobs\.dou\.ua/i.test(String(page?.url||"https://jobs.dou.ua/"))&&
    !/вакансії|vacancies|jobs|робота/i.test(title+"\n"+text.slice(0,2200)))
   return {state:"unrecognized_page",items:[],checked:0};
 const rows=new Map();
 for(const node of rawNodes){
  if(!node||typeof node!=="object")continue;
  const loc=canonicalDouVacancy(node.href||node.url||node.attributes?.href||node.attrs?.href);
  if(!loc)continue;
  const labels=[node.text,node.name,node.innerText,node.accessibleName,node.title,
    node.parent?.text,node.context?.text].filter(x=>typeof x==="string").map(x=>x.replace(/\s+/g," ").trim());
  const name=labels.find(x=>x.length>=8&&x.length<=210&&!/^читати|read more|відгукнутися/i.test(x))||"";
  const current=rows.get(loc.url)||{...loc,title:"",evidence:"",source_query:search};
  if(name.length>current.title.length)current.title=name.slice(0,190);
  current.evidence=labels.reduce((a,v)=>v.length>a.length?v:a,current.evidence).slice(0,2100);
  rows.set(loc.url,current);
 }
 const items=[...rows.values()].filter(x=>x.title.length>=8);
 // Search results may contain site footer/suggestions; real job links must be
 // visible as vacancy anchors, never guessed from prose without link evidence.
 return {state:"ok",items:items.slice(0,25),checked:items.length,observed_at:now.toISOString()};
}
export function extractDouJobDetail(page,expectedUrl){
 const location=canonicalDouVacancy(expectedUrl);
 if(!location)return {state:"invalid_job_url"};
 const dom=(typeof page?.bodyText==="string"?page.bodyText:
  String(page?.bodyText?.head||"")+"\n"+String(page?.bodyText?.tail||"")).replace(/\u0000/g,"").trim();
 const heading=String(page?.title||"").trim();
 const front=(heading+"\n"+dom.slice(0,1200)).toLowerCase();
 if(/(?:403 forbidden|access denied|captcha|just a moment|verify you are human)/i.test(front))
  return {state:"blocked"};
 if(dom.length<170)return {state:"not_enough_evidence"};
 // DOU job details have description, requirements and contact/submit sections.
 // Trim generic DOU navigation ahead of the role so the AI sees actual
 // responsibilities within its first 1500 characters.
 const lead=heading.split(/\s+[|–—]\s+/)[0].trim().slice(0,100);
 const pos=lead.length>=10?dom.toLowerCase().indexOf(lead.toLowerCase()):-1;
 const text=(pos>400?dom.slice(pos):dom).slice(0,14500);
 const fulltime=/\bfull[\s-]?time\b|повн[а-яіїє]* зайнят/i.test(text);
 const parttime=/\bpart[\s-]?time\b|частков[а-яіїє]* зайнят|неповн[а-яіїє]* день/i.test(text);
 const workMode=/віддален|remote|дистанційн/i.test(text)?"remote":
   /офіс|on[\s-]?site/i.test(text)?"office":"unknown";
 return {state:"ok",description:text,title:heading,
  employment:parttime?"parttime":fulltime?"fulltime":"unknown",
  location_mode:workMode,checked_at:new Date().toISOString()};
}
export const DOU_SEARCH_TARGETS = RADAR_SETTINGS.jobs.browserSources.dou.targets;
export function douSearchUrl(target){
 if(!DOU_SEARCH_TARGETS.some(t=>t.id===target?.id))throw Error("Unknown DOU search target");
 return "https://jobs.dou.ua/vacancies/?search="+encodeURIComponent(target.query);
}
export function douBatch(slotIndex,size=2){
 const n=DOU_SEARCH_TARGETS.length;
 if(!n)return [];
 const start=(Math.abs(Number(slotIndex)||0)*size)%n;
 return Array.from({length:size},(_,i)=>DOU_SEARCH_TARGETS[(start+i)%n]);
}
export function douLeadLane(x){
 const text=(String(x.title||"")+" "+String(x.description||"")).toLowerCase();
 if(/(?:підрядник|subcontract|outsource|партнерств|agency partner|contractor)/i.test(text))return "agency_subcontract";
 if(/(?:part[\s-]?time|частков[а-яіїє]* зайнят|неповн[а-яіїє]* зайнят)/i.test(text))return "fractional_employment";
 return "employment";
}
