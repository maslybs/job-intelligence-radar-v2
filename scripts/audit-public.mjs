import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
const files=[...new Set(execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],
  {encoding:"utf8"}).split("\n").filter(Boolean))];
const privateNames=["config/radar.config.json","src/config/radar.generated.js",".dev.vars",".env",".local-migration/","archive/"];
const checks=[
 ["absolute personal home",/\/Users\/[\w.-]+\//],
 ["OpenAI API credential",/\bsk-[A-Za-z0-9_-]{20,}\b/],
 ["GitHub access token",/\bghp_[A-Za-z0-9]{25,}\b/],
 ["Telegram bot credential",/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/],
 ["Cloudflare account identifier",/\b[a-f0-9]{32}\b/],
 ["Email address",/\b[A-Z0-9._%+-]+@(?!example\.(?:com|org|net|invalid)\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
 ["Embedded URL credentials",/https?:\/\/[^\s/@:]+:[^\s/@]+@(?!example\.(?:com|org|net|invalid)\b)/i],
 ["Private key material",/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
 ["Bearer JWT token",/\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/]
];
const failures=[];
const privateMarkers=String(process.env.RADAR_PUBLIC_PRIVATE_MARKERS||"")
  .split(",").map(s=>s.trim().toLowerCase()).filter(s=>s.length>=4);
for(const file of files){
 if(file!==".env.example"&&privateNames.some(p=>file===p||file.startsWith(p))){failures.push(file+": private path staged");continue;}
 let content;try{content=readFileSync(file,"utf8")}catch{continue}
 for(const [label,pattern] of checks)if(pattern.test(content))failures.push(file+": "+label);
 if(privateMarkers.some(marker=>content.toLowerCase().includes(marker)))
   failures.push(file+": configured private identity marker");
}
console.log(JSON.stringify({stagedFilesAudited:files.length,failures},null,2));
if(failures.length)process.exitCode=1;
