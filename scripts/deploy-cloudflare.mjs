import {readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const CONFIG="wrangler.jsonc";
const D1_BINDING="DB";
const validUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function matchD1Database(config,remoteDatabases) {
  const binding=config.d1_databases?.find(item=>item.binding===D1_BINDING);
  if(!binding?.database_name)throw Error("A DB D1 binding with database_name is required");
  const matches=remoteDatabases.filter(item=>item.name===binding.database_name);
  if(matches.length!==1)throw Error(
    "Expected one D1 database named "+JSON.stringify(binding.database_name)+
    " in the connected Cloudflare account, found "+matches.length+
    ". Verify your resource name and Cloudflare account before retrying."
  );
  const id=matches[0].uuid||matches[0].id;
  if(!validUuid.test(String(id||"")))throw Error("Cloudflare did not return a valid D1 database UUID");
  return {name:binding.database_name,id};
}

export function bindDiscoveredD1(config,remoteDatabases) {
  const current=config.d1_databases?.find(item=>item.binding===D1_BINDING);
  if(!current)throw Error("DB binding is missing");
  // Never override an already configured ID: that could migrate the wrong database.
  if(current.database_id && validUuid.test(current.database_id)&&
    !/^00000000-0000-4000-8000-000000000000$/i.test(current.database_id))
    return {config,updated:false,id:current.database_id};
  const db=matchD1Database(config,remoteDatabases);
  return {config:{...config,d1_databases:config.d1_databases.map(item=>
    item.binding===D1_BINDING?{...item,database_id:db.id}:item)},updated:true,id:db.id};
}

function run(args,{capture=false}={}) {
  const result=spawnSync("wrangler",args,{
    encoding:"utf8",stdio:capture?["ignore","pipe","inherit"]:"inherit"
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw Error("wrangler "+args.join(" ")+" failed with exit status "+result.status);
  return result.stdout||"";
}

// Cloudflare may preserve comments and trailing commas in wrangler.jsonc.
export function parseWranglerJsonc(text) {
  let out="",quoted=false,escaped=false,line=false,block=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(line){if(c==="\n"){line=false;out+="\n"}else out+=" ";continue}
    if(block){if(c==="*"&&n==="/"){block=false;out+="  ";i++}
      else out+=c==="\n"?"\n":" ";continue}
    if(quoted){out+=c;if(escaped)escaped=false;else if(c==="\\")escaped=true;
      else if(c==='"')quoted=false;continue}
    if(c==='"'){quoted=true;out+=c;continue}
    if(c==="/"&&n==="/"){line=true;out+="  ";i++;continue}
    if(c==="/"&&n==="*"){block=true;out+="  ";i++;continue}
    out+=c;
  }
  let cleaned="",inString=false,escapeNext=false;
  for(let i=0;i<out.length;i++){
    const c=out[i];
    if(inString){cleaned+=c;if(escapeNext)escapeNext=false;
      else if(c==="\\")escapeNext=true;else if(c==='"')inString=false;continue}
    if(c==='"'){inString=true;cleaned+=c;continue}
    if(c===","){
      let next=i+1;
      while(next<out.length&&/\s/.test(out[next]))next++;
      if(out[next]==="}"||out[next]==="]")continue;
    }
    cleaned+=c;
  }
  return JSON.parse(cleaned);
}

export function parseD1List(output) {
  // Some Wrangler versions prefix the JSON with progress/log lines.
  const start=output.indexOf("[");
  if(start<0)throw Error("No JSON D1 database list returned by Wrangler");
  const data=JSON.parse(output.slice(start));
  if(!Array.isArray(data))throw Error("Unexpected D1 list response");
  return data;
}

export function deploy() {
  // A fresh clone has no private configuration; generate an anonymous build.
  const generated=spawnSync("npm",["run","config:generate"],{stdio:"inherit"});
  if(generated.error)throw generated.error;
  if(generated.status!==0)throw Error("Configuration generation failed");

  // Wrangler/Cloudflare Deploy button provisions D1 on the first deployment.
  run(["deploy"]);

  // Cloudflare button usually injects the D1 UUID. If an older Wrangler doesn't
  // write it to disk, look up the exact newly provisioned database by name.
  const source=readFileSync(CONFIG,"utf8");
  const config=parseWranglerJsonc(source);
  const binding=config.d1_databases?.find(item=>item.binding===D1_BINDING);
  if(!binding)throw Error("DB binding missing after Worker deployment");
  if(!binding.database_id||
    /^00000000-0000-4000-8000-000000000000$/i.test(binding.database_id)) {
    const found=bindDiscoveredD1(config,parseD1List(run(["d1","list","--json"],{capture:true})));
    writeFileSync(CONFIG,JSON.stringify(found.config,null,2)+"\n");
    console.log("Resolved newly provisioned D1 binding; no credentials written.");
  }
  // Use the binding name (not a hard-coded database name), and fail the
  // deployment if schema migrations fail; never silently deploy an empty D1.
  run(["d1","migrations","apply",D1_BINDING,"--remote","--yes"]);
  console.log("Cloudflare Worker deployed and D1 migrations applied.");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{deploy()}catch(error){
    console.error("Deploy failed:",String(error?.message||error));
    process.exitCode=1;
  }
}
