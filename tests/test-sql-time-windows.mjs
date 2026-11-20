import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {Miniflare} from "miniflare";
const health=readFileSync("src/features/observability/hourly-health.js","utf8");
const reviews=readFileSync("src/features/ai/opportunity-intelligence.js","utf8");
for(const column of ["discovered_at","assessed_at","alerted_at"])
 assert(health.includes("julianday("+column+")>=julianday('now','-12 hours')"),
   column+" must use numeric date comparison");
assert(reviews.includes("julianday(j.discovered_at)>=julianday('now','-14 days')"));
const instance=new Miniflare({script:"export default {fetch(){return new Response('ok')}}",
 modules:true,compatibilityDate:"2026-05-03",d1Databases:{DB:"TEST_SQL_WINDOWS"}});
try{
 const db=await instance.getD1Database("DB");
 await db.prepare("CREATE TABLE samples(ts TEXT)").run();
 for(const hours of [12,336]){
   const cutoff=(await db.prepare("SELECT datetime('now',?) AS time")
     .bind("-"+hours+" hours").first()).time;
   const before=new Date(cutoff.replace(" ","T")+"Z").getTime()-60_000;
   const after=new Date(cutoff.replace(" ","T")+"Z").getTime()+60_000;
   await db.prepare("DELETE FROM samples").run();
   await db.batch([before,after].map(time=>db.prepare(
     "INSERT INTO samples(ts) VALUES(?)").bind(new Date(time).toISOString())));
   const correct=await db.prepare("SELECT COUNT(*) n FROM samples "+
     "WHERE julianday(ts)>=julianday('now',?)").bind("-"+hours+" hours").first();
   const broken=await db.prepare("SELECT COUNT(*) n FROM samples "+
     "WHERE ts>=datetime('now',?)").bind("-"+hours+" hours").first();
   assert.equal(correct.n,1,hours+"-hour window correct boundary");
   assert.equal(broken.n,2,hours+"-hour window old SQL demonstrably wrong");
 }
}finally{await instance.dispose();}
console.log("PASS native SQLite/D1 12-hour and 14-day boundary filters");
