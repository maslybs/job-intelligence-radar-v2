import {strict as assert} from "node:assert";
import {readFileSync,existsSync} from "node:fs";
import {dirname,resolve} from "node:path";

const files=[
 "README.md","README.uk.md",
 "docs/one-click.md","docs/one-click.uk.md",
 "docs/configuration.md","docs/configuration.uk.md",
 "docs/usage.uk.md"
];
for(const file of files){
 const body=readFileSync(file,"utf8");
 assert(body.trim().length>250,"documentation must not be empty: "+file);
 for(const [,raw] of body.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)){
  if(/^(?:https?:|mailto:|#)/.test(raw))continue;
  const local=decodeURIComponent(raw.split("#")[0]);
  assert(existsSync(resolve(dirname(file),local)),file+" contains a broken relative link: "+raw);
 }
}
const english=readFileSync("README.md","utf8");
const ukrainian=readFileSync("README.uk.md","utf8");
assert(english.includes("[Українська](README.uk.md)"));
assert(ukrainian.includes("[English](README.md)"));
for(const path of ["docs/one-click.uk.md","docs/configuration.uk.md","docs/usage.uk.md"])
 assert(ukrainian.includes(path),"Ukrainian start page must link "+path);
for(const item of ["INBOX_PASSWORD","ADMIN_TOKEN","RADAR_CONFIG_JSON","Cloudflare"])
 assert(readFileSync("docs/one-click.uk.md","utf8").includes(item));
for(const item of ["jobs.profile","jobs.criteria","leads.enabled","TG_BOT_TOKEN"])
 assert(readFileSync("docs/configuration.uk.md","utf8").includes(item));
for(const item of ["/inbox","/admin/stats","/admin/scan","/admin/assess"])
 assert(readFileSync("docs/usage.uk.md","utf8").includes(item));
console.log("PASS bilingual GitHub navigation, Ukrainian setup, configuration, usage and valid relative links");
