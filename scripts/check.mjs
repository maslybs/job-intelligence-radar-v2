import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { spawnSync } from "node:child_process";
const walk = d => readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(d,x.name)):/\.(?:js|mjs|cjs)$/.test(x.name)?[join(d,x.name)]:[]);
const files = [...walk("src"),...walk("tests"),...walk("scripts")];
const problems = [];
for(const file of files){
  const checked=spawnSync(process.execPath,["--check",file],{encoding:"utf8"});
  if(checked.status!==0)problems.push(file+": syntax "+checked.stderr.trim().slice(0,400));
  const text=readFileSync(file,"utf8");
  for(const match of text.matchAll(/\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){
    const target=normalize(join(dirname(file),match[1]));
    if(!existsSync(target))problems.push(file+": unresolved "+match[1]);
  }
}
const cfg=JSON.parse(readFileSync("wrangler.jsonc","utf8").replace(/^\s*\/\/.*$/gm,""));
// Public template must never reuse an existing personal/production Worker or D1.
// The limited hourly Cron is intentional; high-frequency and private bridges stay off.
if(cfg.name!=="job-intelligence-radar-starter")problems.push("unexpected public template Worker name");
if(cfg.workers_dev!==true)problems.push("public install must expose a workers.dev URL");
if(JSON.stringify(cfg.triggers?.crons)!==JSON.stringify(["0 * * * *"]))
  problems.push("public template must use only the hourly scan");
const databases=cfg.d1_databases||[];
if(databases.length!==1||databases[0].binding!=="DB"||
   databases[0].database_name!=="job-intelligence-radar-starter-db"||
   Object.hasOwn(databases[0],"database_id"))
  problems.push("public template must auto-provision its own D1, without an existing database ID");
if(cfg.vars?.REDDIT_MCP_ENABLED!=="0"||cfg.vars?.DOU_BROWSER_ENABLED!=="0")
  problems.push("private browser integrations must default to disabled");
console.log(JSON.stringify({files_checked:files.length,source_files:walk("src").length,test_files:walk("tests").length,problems},null,2));
if(problems.length)process.exitCode=1;
