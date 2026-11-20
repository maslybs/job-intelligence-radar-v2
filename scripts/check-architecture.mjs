import {strict as assert} from "node:assert";
import {readFileSync,readdirSync} from "node:fs";
import {join,posix} from "node:path";
import * as acorn from "acorn";

function walk(dir){
 return readdirSync(dir,{withFileTypes:true}).flatMap(x=>
  x.isDirectory()?walk(join(dir,x.name)):x.name.endsWith(".js")?[join(dir,x.name).split("\\").join("/")]:[]);
}
const files=walk("src");
const entries=new Set(files),edges=new Map();
const violations=[];
for(const file of files){
 const source=readFileSync(file,"utf8");
 const parsed=acorn.parse(source,{ecmaVersion:"latest",sourceType:"module"});
 const links=[];
 for(const n of parsed.body){
  if(n.type!=="ImportDeclaration"&&!((n.type==="ExportNamedDeclaration"||n.type==="ExportAllDeclaration")&&n.source))continue;
  const target=n.source?.value;
  if(!target?.startsWith("."))continue;
  const resolved=posix.normalize(posix.join(posix.dirname(file),target));
  if(!entries.has(resolved))violations.push(file+": unresolved import/export "+target);
  else links.push(resolved);
 }
 edges.set(file,links);
 if(!file.endsWith("/radar.generated.js") && source.split("\n").length>700)violations.push(file+": over 700 source lines (module decomposition required)");
}
const state=new Map(),stack=[];
function visit(file){
 if(state.get(file)===2)return;
 if(state.get(file)===1){
  violations.push("Cyclic import: "+[...stack,file].join(" -> "));
  return;
 }
 state.set(file,1);stack.push(file);
 for(const target of edges.get(file)||[])visit(target);
 stack.pop();state.set(file,2);
}
for(const file of files)visit(file);
const root=readFileSync("src/app/worker.js","utf8");
if(root.split("\n").length>30)violations.push("Cloudflare composition root exceeds 30 lines");
if(!root.includes("fetch:handleFetch")||!root.includes("scheduled")||
   !root.includes("ManualRadarWorkflow")||!root.includes("RedditMcpWorkflow")||
   !root.includes("DouBrowserWorkflow"))violations.push("Cloudflare exported runtime handlers/bindings incomplete");
if(!entries.has("src/http/router.js")||!entries.has("src/scheduler/scheduled-handler.js")||
   !entries.has("src/workflows/manual-radar.js")||!entries.has("src/ai/job-evaluation-service.js")||
   !entries.has("src/features/discovery/job-collector.js")||
   !entries.has("src/features/delivery/telegram-transport.js")||
   !entries.has("src/features/delivery/lead-notifications.js")||
   !entries.has("src/features/delivery/job-notifications.js"))
 violations.push("Required independently owned runtime module missing");
console.log(JSON.stringify({source_modules:files.length,import_edges:[...edges.values()].reduce((n,x)=>n+x.length,0),composition_lines:root.split("\n").length,violations},null,2));
if(violations.length)process.exitCode=1;
