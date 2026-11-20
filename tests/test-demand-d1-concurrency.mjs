import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {Miniflare} from "miniflare";
import {runDemandDigest} from "../src/features/prospects/demand-discovery.js";
const instance=new Miniflare({
  script:"export default {fetch(){return new Response('ok')}}",
  modules:true,compatibilityDate:"2026-05-03",
  d1Databases:{DB:"TEST_DEMAND_CLAIMS"}
});
try{
  const db=await instance.getD1Database("DB");
  const schema=readFileSync("migrations/0001_core.sql","utf8").split("\n")
    .filter(line=>!line.trimStart().startsWith("--")&&!line.trimStart().startsWith("PRAGMA "))
    .join("\n");
  for(const sql of schema.split(";").map(x=>x.trim()).filter(Boolean)){
    await db.prepare(sql).run();
  }
  await db.exec("CREATE TABLE IF NOT EXISTS reddit_prospects ("+
    "job_id TEXT PRIMARY KEY,category TEXT,fit INTEGER,business_signal INTEGER,"+
    "payment_confirmed INTEGER,problem_uk TEXT,solution_uk TEXT,reply_uk TEXT,"+
    "caveat_uk TEXT,alerted_at TEXT);"+
    "CREATE TABLE IF NOT EXISTS prospect_commercial_signals ("+
    "job_id TEXT PRIMARY KEY,commercial_intent TEXT,commercial_score INTEGER,"+
    "buyer_evidence_uk TEXT);");
  const day="2026-11-20",stamp=new Date().toISOString();
  for(let i=0;i<20;i++){
    const id="client-"+String(i).padStart(2,"0");
    await db.batch([
      db.prepare("INSERT INTO jobs(id,fingerprint,title,company,source,url,description,"+
        "region,published_at,discovered_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id,id,"Customers cannot synchronize paid orders","",
          "Community · Synthetic-"+i,
          "https://community.shopify.com/t/business-orders/"+i,
          "The company has paid customers and production orders. Critical API integrations failed.",
          "",stamp,stamp,"queued"),
      db.prepare("INSERT INTO reddit_prospects(job_id,category,fit,business_signal,"+
        "payment_confirmed,problem_uk,solution_uk,reply_uk) VALUES(?,?,?,?,?,?,?,?)")
        .bind(id,"business_problem",91,1,0,
          "Компанія не може синхронізувати замовлення та платежі.",
          "Налагодити інтеграцію та протестувати обмін даними між бізнес-системами.",
          "Запропонувати конкретну перевірку."),
      db.prepare("INSERT INTO prospect_commercial_signals(job_id,commercial_intent,"+
        "commercial_score,buyer_evidence_uk) VALUES(?,?,?,?)")
        .bind(id,"commercial_blocker",85,
          "A business owner reports broken paid customer orders."),
      db.prepare("INSERT INTO meta(key,value) VALUES(?,?)")
        .bind("community_reply_review_"+id,JSON.stringify({state:"open"}))
    ]);
  }
  await db.prepare("CREATE TABLE IF NOT EXISTS demand_signals_sent ("+
    "job_id TEXT PRIMARY KEY,slot TEXT,day TEXT,sent_at TEXT)").run();
  await db.prepare("INSERT INTO demand_signals_sent(job_id,slot,day,sent_at) VALUES(?,?,?,?)")
    .bind("client-00","prior_slot",day,stamp).run();
  const delivered=[];
  const env={DB:db};
  const slots=["parallel_slot_1","parallel_slot_2","parallel_slot_3","parallel_slot_4"];
  const result=await Promise.all(slots.map(slot=>runDemandDigest(env,{
    day,slot,send:true,deliver:async message=>{delivered.push({slot,message});}
  })));
  const claims=(await db.prepare(
    "SELECT job_id,slot,state FROM demand_signal_claims ORDER BY job_id").all()).results;
  const sent=(await db.prepare(
    "SELECT job_id FROM demand_signals_sent ORDER BY job_id").all()).results;
  assert(claims.length<=10,"day quota includes prior deliveries");
  assert.equal(new Set(claims.map(x=>x.job_id)).size,claims.length,
    "even competing slots cannot claim the same job twice");
  assert.equal(sent.length,claims.length,"all successful sends have acknowledgements");
  assert(claims.some(x=>x.job_id==="client-00"&&x.state==="sent"),
    "historical deliveries are protected");
  assert(!delivered.some(x=>x.message.includes("/business-orders/0")),
    "historical lead cannot reappear in new digests");
  assert(delivered.length>0,"the test should actually send digests");
  for(const slot of slots){
    const repeat=await runDemandDigest(env,{day,slot,send:true,
      deliver:async()=>{throw Error("duplicate send")}});
    assert.equal(repeat.state,"already_reserved");
  }
  const batches=(await db.prepare("SELECT state,items_json FROM demand_digest_batches").all()).results;
  for(const row of batches){
    assert(["sent","empty"].includes(row.state));
    if(row.state==="sent"){
      const ids=JSON.parse(row.items_json);
      assert(ids.length<=5);
      assert(ids.every(id=>claims.some(c=>c.job_id===id)),"batch records its claimed payload");
    }
  }
  const quota=await runDemandDigest(env,{day,slot:"quota_filled",send:true,
    deliver:async()=>{throw Error("quota exceeded")}});
  assert.equal(quota.state,"daily_cap");
  console.log("PASS native D1 concurrent digest claims, per-day cap and historical backfill");
}finally{await instance.dispose();}
