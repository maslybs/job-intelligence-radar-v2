import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Miniflare} from "miniflare";

// Fresh-install characterization: all migration files must run against an
// actually empty D1 database. No existing or user's Cloudflare DB is touched.
const mf=new Miniflare({
 script:"export default {fetch(){return new Response('ok')}}",
 modules:true,compatibilityDate:"2026-05-03",
 d1Databases:{DB:"NEW_PUBLIC_TEMPLATE_INSTALL"}
});
try{
 const db=await mf.getD1Database("DB");
 for(const name of ["0001_core.sql","0002_delivery_auth_hardening.sql","0003_demand_claims.sql"]){
  const sql=readFileSync("migrations/"+name,"utf8")
    .split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");
  const statements=sql.split(";").map(s=>s.trim()).filter(Boolean);
  for(const statement of statements)await db.prepare(statement).run();
 }
 // Reapplying the migration statements must not delete or corrupt D1.
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(x=>x.name);
 for(const expected of ["jobs","meta","runs","ai_budget_usage","demand_signal_claims",
  "demand_signals_sent","telegram_delivery_outbox","login_rate_limits"])
  assert(tables.includes(expected),"fresh DB missing "+expected);
 const result=await db.prepare("SELECT COUNT(*) AS n FROM demand_signal_claims").first();
 assert.equal(result.n,0,"an anonymous installation starts without personal historical leads");
 console.log("PASS fresh D1 install: three migrations, required tables and no historical data");
}finally{await mf.dispose()}
