// Isolated Cloudflare-runtime contract smoke. Run only after 'npm run build:check'.
// No Cloudflare account connection, Telegram token, live URL or external network required.
import {strict as assert} from "node:assert";
import {Miniflare} from "miniflare";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";

const instance = new Miniflare({
  scriptPath:".wrangler/build-check/index.js",
  modules:true,
  // Local workerd bundled with Wrangler 4.86.0 supports up to 2026-05-03.
  // This test date is local-only; production compatibility_date remains 2026-09-22.
  compatibilityDate:"2026-05-03",
  d1Databases:{DB:"RADAR_D1_TEST"},
  bindings:{ADMIN_TOKEN:"only-for-local-test",INBOX_PASSWORD:"only-for-local-test-password",AUTH_TOKEN:"only-for-local-test-auth"}
});
async function request(route,init){
 const response=await instance.dispatchFetch("https://local.invalid"+route,init);
 return {status:response.status,body:await response.text(),headers:response.headers};
}
try{
 const health=await request("/health");
 assert.equal(health.status,200);
 assert.equal(JSON.parse(health.body).ai_daily_limit,RADAR_SETTINGS.ai.dailyEvaluationLimit);
 const denied=await request("/admin/stats");
 assert.equal(denied.status,403);
 assert.deepEqual(JSON.parse(denied.body),{error:"not authorized"});
 const deniedIncidents=await request("/admin/telegram/delivery-issues");
 assert.equal(deniedIncidents.status,403);
 const incidents=await request("/admin/telegram/delivery-issues",{
   headers:{Authorization:"Bearer only-for-local-test"}
 });
 assert.equal(incidents.status,200);
 assert.deepEqual(JSON.parse(incidents.body),{count:0,incidents:[]});
 const inbox=await request("/inbox");
 assert.equal(inbox.status,200);
 assert(inbox.body.includes('method="post"')&&inbox.body.includes('action="/login"'));
 const upwork=await request("/admin/upwork/test",{headers:{Authorization:"Bearer only-for-local-test"}});
 assert.equal(upwork.status,410);
 assert.equal(JSON.parse(upwork.body).state,"disabled");
 const probe=await request("/admin/reddit/private-probe",{headers:{Authorization:"Bearer only-for-local-test"}});
 assert.equal(probe.status,503);
 const reason=JSON.parse(probe.body).reason;
 assert.equal(reason,RADAR_SETTINGS.integrations.oneaihub.enabled?"no VPC binding":"disabled_by_configuration");
 const badLogin=await request("/login",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"password=wrong"});
 assert.equal(badLogin.status,200);
 assert(badLogin.body.includes("Job Radar"));
 const goodLogin=await request("/login",{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded"},body:"password=only-for-local-test-password"});
 assert.equal(goodLogin.status,303);
 assert(goodLogin.headers.get("set-cookie")?.includes("HttpOnly"));
 // Production D1 semantics: every login attempt is atomically charged before
 // password validation, including parallel guesses. Missing cookies cannot bypass.
 for(let i=0;i<5;i++){
   const guess=await request("/login",{method:"POST",
     headers:{"content-type":"application/x-www-form-urlencoded"},
     body:"password=wrong"+i});
   assert.equal(guess.status,200,"first five guesses are counted");
 }
 const blocked=await request("/login",{method:"POST",
   headers:{"content-type":"application/x-www-form-urlencoded"},
   body:"password=wrong6"});
 assert.equal(blocked.status,429,"sixth attempt throttled by D1");
 assert(Number(blocked.headers.get("Retry-After"))>0);
 const blockedValid=await request("/login",{method:"POST",
   headers:{"content-type":"application/x-www-form-urlencoded"},
   body:"password=only-for-local-test-password"});
 assert.equal(blockedValid.status,429,"known password cannot bypass active lock");
 const d1=await instance.getD1Database("DB");
 await d1.prepare("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT)").run();
 const reddit=await request("/admin/reddit/health",{headers:{Authorization:"Bearer only-for-local-test"}});
 assert.equal(reddit.status,200);
 const report=JSON.parse(reddit.body);
 assert.equal(report.oneaihub.available,false);
 assert.equal(report.oneaihub.reason,RADAR_SETTINGS.integrations.oneaihub.enabled?"vpc_binding_unavailable":"disabled_by_configuration");
 console.log("PASS Cloudflare runtime HTTP smoke (9 routes): health, admin auth, inbox, retired Upwork, optional OneAIHUB, signed login, Reddit health; profile="+(RADAR_SETTINGS.leads.enabled?"private":"public"));
}finally{
 await instance.dispose();
}
