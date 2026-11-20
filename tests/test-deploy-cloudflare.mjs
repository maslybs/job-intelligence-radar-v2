import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {matchD1Database,bindDiscoveredD1,parseD1List,parseWranglerJsonc} from "../scripts/deploy-cloudflare.mjs";

const jsonc='// comment\n{"url":"https://example.com/a//b","arr":[1,2,],/* block */"enabled":true,}';
assert.deepEqual(parseWranglerJsonc(jsonc),{
  url:"https://example.com/a//b",arr:[1,2],enabled:true
});
const sample={d1_databases:[{binding:"DB",database_name:"my-radar-d1"}]};
const remote=[
  {name:"not-my-database",uuid:"10000000-1111-4222-8333-444444444444"},
  {name:"my-radar-d1",uuid:"20000000-1111-4222-8333-444444444444"}
];
assert.equal(matchD1Database(sample,remote).id,remote[1].uuid);
assert.deepEqual(parseD1List(JSON.stringify(remote)),remote);
assert.equal(parseD1List("wrangler log\n"+JSON.stringify(remote)).length,2);
assert.throws(()=>matchD1Database(sample,remote.slice(0,1)),/Expected one/);
assert.throws(()=>matchD1Database(sample,[remote[1],remote[1]]),/found 2/);
assert.throws(()=>matchD1Database(sample,[{name:"my-radar-d1",uuid:"invalid"}]),/valid D1 database UUID/);
const patched=bindDiscoveredD1(sample,remote);
assert.equal(patched.updated,true);
assert.equal(patched.config.d1_databases[0].database_id,remote[1].uuid);
assert.equal(sample.d1_databases[0].database_id,undefined,"input must remain untouched");
const existing={d1_databases:[{...sample.d1_databases[0],database_id:remote[0].uuid}]};
const unchanged=bindDiscoveredD1(existing,remote);
assert.equal(unchanged.updated,false,"never replace a configured D1 id");
assert.equal(unchanged.id,remote[0].uuid);

const pkg=JSON.parse(readFileSync("package.json","utf8"));
const wrangler=JSON.parse(readFileSync("wrangler.jsonc","utf8"));
const example=readFileSync(".env.example","utf8");
const readme=readFileSync("README.md","utf8");
assert.equal(pkg.scripts.build,"npm run config:generate");
assert.equal(pkg.scripts.deploy,"node scripts/deploy-cloudflare.mjs");
assert.equal(wrangler.workers_dev,true);
assert.deepEqual(wrangler.triggers.crons,["0 * * * *"]);
assert.equal(wrangler.d1_databases[0].database_id,undefined);
assert.deepEqual(wrangler.workflows.map(w=>w.binding),[
 "REDDIT_MCP_WORKFLOW","MANUAL_RADAR_WORKFLOW","DOU_BROWSER_WORKFLOW"
]);
assert.match(example,/^INBOX_PASSWORD=$/m);
assert.match(example,/^ADMIN_TOKEN=$/m);
assert.match(readme,/https:\/\/deploy\.workers\.cloudflare\.com\/\?url=https:\/\/github\.com\/maslybs\/job-intelligence-radar-v2/);
assert.doesNotMatch(example,/secret\s*=\s*[\w]{12,}/i);
console.log("PASS one-click Cloudflare template, isolated D1 auto-provision and no secrets");
