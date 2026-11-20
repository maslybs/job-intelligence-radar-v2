import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {listingIsActionable} from "../discovery/source-accessibility.js";
// Bounded actionable-review lane independent from P1/P2 verified delivery.
// Do not claim unknown country, pay, remote or hours as confirmed.
// Persist a deduplication record only after Telegram accepted a message.
const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const short=(x,n=140)=>{let s=String(x??"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();return s.length>n?s.slice(0,n-1).trimEnd()+"…":s};
const domainAllowed=new Set(["djinni.co","himalayas.app","jobicy.com","jobicy.com","www.remotebackendjobs.com","www.remotefrontendjobs.com","weworkremotely.com","www.weworkremotely.com"]);
const excluded=/(?:must (?:live|reside|be based) in (?:us|usa|canada|uk)|(?:usa|us|canada|india|uk)\s+only|(?:onsite|on-site) (?:only|required)|(?:relocation|required clearance)|unpaid|equity only|commission only|internship|banking background|required (?:banking|insurance|medical|clinical) (?:background|certification)|\b(?:CISSP|CPA|CFA|PMP) certification required)/i;
export function chooseActionableReview(rows,alreadySent=[],limit=3){
 const skip=new Set(alreadySent.map(String));
 const out=[],usedLinks=new Set();
 const sorted=(rows||[]).filter(x=>{
  if(!x.id||skip.has(String(x.id))||x.alerted_at||x.kind!=="buyer"||!listingIsActionable(x))return false;
  if(!["filtered","unread"].includes(x.state)||Number(x.score)<80)return false;
  if(x.geo==="restricted")return false;
  const combined=[x.title,x.description,x.region,x.reason].join(" ").slice(0,4000);
  if(excluded.test(combined))return false;
  let u;try{u=new URL(String(x.url||""))}catch{return false}
  if(u.protocol!=="https:"||!domainAllowed.has(u.hostname.toLowerCase()))return false;
  return true;
 }).sort((a,b)=> {
  const rank=x=>Number(x.score)+(x.geo==="allowed"?6:0)+(x.engagement==="contract"?13:0)+
  (x.engagement==="unknown"?4:0)-(x.engagement==="fulltime"?4:0);
  return rank(b)-rank(a)||String(b.discovered_at||"").localeCompare(String(a.discovered_at||""));
 });
 for(const job of sorted){
  if(out.length>=limit)break;
  if(usedLinks.has(job.url))continue;
  out.push(job);usedLinks.add(job.url);
 }
 return out;
}
export function renderActionableReview(rows){
 return [
  "🔎 <b>Radar · вакансії, які варто перевірити зараз</b>",
  "<i>Це НЕ підтверджені для України пропозиції. Умови зайнятості, актуальність і можливість подати заявку потрібно перевірити на оригінальній сторінці. Жодних платних підписок Radar не рекомендує.</i>",
  ...rows.map((j,i)=>[
    "<b>"+(i+1)+". "+escapeHtml(short(j.title,100))+"</b>",
    "Відповідність: "+Math.round(Number(j.score))+"/100 · "+escapeHtml(short(j.source,65)),
    "Географія: "+(j.geo==="allowed"?"попередньо допустима":"не підтверджена"),
    "Зайнятість: "+(j.engagement==="contract"?"контракт":j.engagement==="fulltime"?"повна зайнятість — уточни можливість 30 год/тиждень":"потрібно уточнити"),
    "Чому цікаво: "+escapeHtml(short(j.reason,210)),
    '<a href="'+escapeHtml(j.url)+'">Перевірити вимоги й відгукнутися</a>'
  ].join("\n")),
  "<i>Якщо підходить — напиши роботодавцю. Повторів уже надісланих вакансій у цьому каналі не буде.</i>"
 ].join("\n\n");
}
export async function runActionableReview(env,{deliver,preview=false,maxPerDay=9}={}){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS actionable_review_sent (job_id TEXT PRIMARY KEY,at TEXT NOT NULL,slot TEXT NOT NULL)").run();
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:RADAR_SETTINGS.notifications.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const prior=(await env.DB.prepare("SELECT COUNT(*) n FROM actionable_review_sent WHERE at>=?").bind(day).first())?.n||0;
 const available=Math.max(0,Math.min(3,maxPerDay-Number(prior)));
 if(!available)return {state:"daily_cap",sent_today:prior};
 const records=(await env.DB.prepare(
  "SELECT id,title,description,url,source,reason,region,geo,engagement,score,state,kind,alerted_at,discovered_at "+
  "FROM jobs WHERE state IN ('filtered','unread') AND alerted_at IS NULL "+
  "AND kind='buyer' AND score>=80 AND geo!='restricted' "+
  "AND julianday(published_at)>=julianday('now','-96 hours') "+
  "AND source NOT LIKE 'Reddit%' AND source NOT LIKE 'Upwork%' "+
  "AND source NOT LIKE 'Freelance.ua%' ORDER BY score DESC,discovered_at DESC LIMIT 100"
 ).all()).results||[];
 const sent=(await env.DB.prepare("SELECT job_id FROM actionable_review_sent").all()).results||[];
 const exclusions=new Set(sent.map(r=>r.job_id));
 const former=(await env.DB.prepare("SELECT ids FROM eligibility_review_slots WHERE state='sent'").all().catch(()=>({results:[]}))).results||[];
 for(const s of former)try{for(const id of JSON.parse(s.ids||"[]"))exclusions.add(id)}catch{}
 const direct=(await env.DB.prepare("SELECT job_id FROM direct_contact_sent").all().catch(()=>({results:[]}))).results||[];
 for(const x of direct)exclusions.add(x.job_id);
 const chosen=chooseActionableReview(records,[...exclusions],available);
 if(!chosen.length)return {state:"no_new_contactable_jobs",considered:records.length};
 let message=renderActionableReview(chosen);
 while(message.length>3850&&chosen.length>1){chosen.pop();message=renderActionableReview(chosen)}
 if(message.length>4000)return {state:"message_too_long"};
 if(preview)return {state:"preview",selected:chosen.map(j=>({title:j.title,score:j.score,url:j.url})),message};
 if(typeof deliver!=="function")throw Error("No Telegram delivery method");
 // D1 reservation via a unique slot prevents duplicate trigger attempts.
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS actionable_review_slots(slot TEXT PRIMARY KEY,state TEXT NOT NULL,ids TEXT NOT NULL,at TEXT NOT NULL)").run();
 const slot=new Date().toISOString().slice(0,13);
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO actionable_review_slots(slot,state,ids,at) VALUES(?,?,?,?)")
  .bind(slot,"reserved",JSON.stringify(chosen.map(j=>j.id)),new Date().toISOString()).run();
 if(!claim.meta?.changes)return {state:"already_running_or_sent"};
 try{
  await deliver(message);
  const at=new Date().toISOString();
  await env.DB.batch([
   env.DB.prepare("UPDATE actionable_review_slots SET state='sent' WHERE slot=?").bind(slot),
   ...chosen.map(j=>env.DB.prepare("INSERT OR IGNORE INTO actionable_review_sent(job_id,at,slot) VALUES(?,?,?)").bind(j.id,at,slot))
  ]);
  return {state:"sent",count:chosen.length,ids:chosen.map(x=>x.id)};
 }catch(e){
  await env.DB.prepare("UPDATE actionable_review_slots SET state='uncertain' WHERE slot=?").bind(slot).run().catch(()=>{});
  return {state:"uncertain",error:String(e?.message||e).slice(0,130)};
 }
}
