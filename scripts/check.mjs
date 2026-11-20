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
if(cfg.name==="job-intelligence-radar-luna")problems.push("production Worker name must not be used");
if(cfg.workers_dev!==false)problems.push("workers_dev must stay disabled in the migration configuration");
if((cfg.triggers?.crons||[]).length)problems.push("migration Cron triggers must stay disabled");
if(cfg.d1_databases?.some(d=>d.database_id!=="00000000-0000-4000-8000-000000000000"))problems.push("production D1 binding detected in development config");
if(cfg.vars?.REDDIT_MCP_ENABLED!=="0"||cfg.vars?.DOU_BROWSER_ENABLED!=="0")problems.push("automation-enabled development environment");
console.log(JSON.stringify({files_checked:files.length,source_files:walk("src").length,test_files:walk("tests").length,problems},null,2));
if(problems.length)process.exitCode=1;
