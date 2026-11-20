// A small manual-eligibility lane. Never misrepresent unknown geography as
// eligibility in the configured applicant region. Completely separate from verified offers.
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=(x,n)=>{const s=String(x??"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();return s.length>n?s.slice(0,n-1).trimEnd()+"…":s;};
const forbidden=/(?:us|usa|united states|canada|eu|europe|uk)\s*(?:only|residents only|applicants only)|(?:only|must be)\s*(?:us|usa|united states|canadian|european|uk)\s*(?:citizens|residents|based)|w2 only|on.?site only|security clearance required/i;
export function pickEligibilityReview(rows,limit=3) {
 const scored=(rows||[]).filter(r=>
  r.geo==="unknown"&&r.kind==="buyer"&&
  ["P1","P2"].includes(r.priority)&&Number(r.score)>=88&&
  (r.engagement==="unknown"||r.engagement==="contract")&&
  /^https:\/\//.test(String(r.url||""))&&
  !/^(?:Reddit|Upwork)/.test(String(r.source||""))&&
  !forbidden.test(String(r.title||"")+" "+String(r.description||"")+" "+String(r.region||""))
 ).sort((a,b)=>Number(b.score)-Number(a.score));
 const used=new Set(),selected=[];
 for(const row of scored){
  if(selected.length>=limit)break;
  const url=String(row.url);
  if(used.has(url))continue;
  used.add(url);selected.push(row);
 }
 return selected;
}
export function renderEligibilityReview(rows,day) {
 return "🔎 <b>Radar · варто перевірити умови</b>\n"+
  esc(day)+" · "+rows.length+" можливості\n"+
  "<i>Це НЕ підтверджені вакансії для України. Спершу уточни країну, формат зайнятості та оплату.</i>\n\n"+
  rows.map((r,i)=>[
   "<b>"+(i+1)+". "+esc(clean(r.title,105))+"</b>",
   "Оцінка відповідності: "+Math.round(Number(r.score))+"/100",
   "Чому цікаво: "+esc(clean(r.reason,190)),
   "Географія: не підтверджена · Формат: "+(r.engagement==="contract"?"контракт":"уточнити"),
   '<a href="'+esc(r.url)+'">Відкрити оригінал</a>'
  ].join("\n")).join("\n\n")+
  "\n\n<i>Не надсилати заявку, доки не перевірено доступність роботи з України.</i>";
}
export async function runEligibilityReview(env,{day,deliver,preview=false}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||"")))throw Error("invalid_review_day");
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS eligibility_review_slots(slot TEXT PRIMARY KEY,state TEXT NOT NULL,ids TEXT NOT NULL,created_at TEXT NOT NULL,sent_at TEXT,error TEXT)").run();
 const slot="daily_"+day;
 const prev=await env.DB.prepare("SELECT state FROM eligibility_review_slots WHERE slot=?").bind(slot).first();
 if(prev)return {state:"already_processed",previous:prev.state,slot};
 const rows=(await env.DB.prepare(
  "SELECT id,title,source,url,priority,score,geo,kind,engagement,description,region,reason,discovered_at "+
  "FROM jobs WHERE alerted_at IS NULL AND state='unread' "+
  "AND priority IN ('P1','P2') AND kind='buyer' AND geo='unknown' AND score>=88 "+
  "AND engagement IN ('unknown','contract') AND source NOT LIKE 'Reddit%' "+
  "AND source NOT LIKE 'Upwork%' AND julianday(discovered_at)>=julianday('now','-36 hours') "+
  "ORDER BY score DESC,discovered_at DESC LIMIT 30"
 ).all()).results||[];
 const selected=pickEligibilityReview(rows);
 if(!selected.length)return {state:"no_unverified_candidates",considered:rows.length};
 const message=renderEligibilityReview(selected,day);
 if(message.length>=3900)return {state:"too_long",length:message.length};
 if(preview)return {state:"preview",selected:selected.map(x=>({id:x.id,title:x.title,score:x.score,url:x.url})),message};
 if(typeof deliver!=="function")throw Error("delivery_not_available");
 const ids=JSON.stringify(selected.map(x=>x.id));
 const now=new Date().toISOString();
 const reserved=await env.DB.prepare("INSERT OR IGNORE INTO eligibility_review_slots(slot,state,ids,created_at) VALUES(?,?,?,?)")
  .bind(slot,"reserved",ids,now).run();
 if(!reserved.meta?.changes)return {state:"already_processed",slot};
 try{
  await deliver(message);
  await env.DB.prepare("UPDATE eligibility_review_slots SET state='sent',sent_at=? WHERE slot=?")
   .bind(new Date().toISOString(),slot).run();
  return {state:"sent",slot,count:selected.length,ids:selected.map(x=>x.id)};
 }catch(e){
  await env.DB.prepare("UPDATE eligibility_review_slots SET state='uncertain',error=? WHERE slot=?")
   .bind(String(e?.message||e).slice(0,150),slot).run().catch(()=>{});
  return {state:"uncertain",slot,error:String(e?.message||e).slice(0,150)};
 }
}
