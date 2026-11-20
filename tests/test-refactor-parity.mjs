// AST-level characterization: extracted declaration bodies must remain byte-for-byte
// equal to their pre-refactor source. This test is independent of the private config.
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import * as acorn from "acorn";
const spec=JSON.parse(readFileSync("tests/fixtures/worker-structural-baseline.json","utf8"));
const parse=file=>{
  const source=readFileSync(file,"utf8");
  const tree=acorn.parse(source,{sourceType:"module",ecmaVersion:"latest"});
  return {source,tree};
};
const knownChanges=JSON.parse(readFileSync("tests/fixtures/intentional-behavior-changes.json","utf8"));
const cache=new Map();
function get(file){if(!cache.has(file))cache.set(file,parse(file));return cache.get(file)}
function digest(text){return createHash("sha256").update(text).digest("hex")}
for(const member of spec.members){
  const {source,tree}=get(member.path);
  const declaration=tree.body.map(x=>x.declaration||x).find(x=>
    (x.type==="FunctionDeclaration"||x.type==="ClassDeclaration")&&x.id.name===member.name||
    x.type==="VariableDeclaration"&&x.declarations.some(d=>d.id.name===member.name));
  assert(declaration,member.name+" missing after modularization in "+member.path);
  assert.equal(digest(source.slice(declaration.start,declaration.end)),member.sha256,
    member.name+" changed during structural extraction (requires deliberate behavior review)");
}
const methods=[["scheduled","src/scheduler/scheduled-handler.js"],["handleFetch","src/http/router.js"]];
for(const [name,file] of methods){
 const {source,tree}=get(file);
 const fn=tree.body.map(x=>x.declaration||x).find(x=>x.type==="FunctionDeclaration"&&x.id.name===name);
 assert(fn,name+" missing");
 if(spec.handlerBodies[name])assert.equal(digest(source.slice(fn.body.start,fn.body.end)),spec.handlerBodies[name],
   name+" body changed during structural extraction");
}
for(const action of spec.workflowActions||[]){
 const {source,tree}=get(action.path);
 const declaration=tree.body.map(x=>x.declaration||x).find(x=>x.type==="FunctionDeclaration"&&x.id.name===action.function);
 assert(declaration,"Extracted durable action missing: "+action.keys.join(","));
 assert.equal(digest(source.slice(declaration.body.start,declaration.body.end)),action.sha256,
   "Cloudflare step behavior changed: "+action.keys.join(","));
}
console.log("PASS original declaration, handler and Workflow action body parity:",
 spec.members.length,"unchanged declarations +",Object.keys(spec.handlerBodies).length,"unchanged Cloudflare event handlers +",
 (spec.workflowActions||[]).length,"durable Workflow actions");

// Preserve original SHA-256 invariants and separately lock reviewed portability edits.
for(const item of knownChanges.members){
 const {source,tree}=get(item.path);
 const node=tree.body.map(x=>x.declaration||x).find(x=>x.id?.name===item.name||x.type==="VariableDeclaration"&&x.declarations.some(d=>d.id.name===item.name));
 assert(node,item.name+" missing after portability migration");
 assert.equal(digest(source.slice(node.start,node.end)),item.after,"Reviewed portability change drifted: "+item.name);
}
for(const item of knownChanges.workflowActions){
 const {source,tree}=get(item.path),node=tree.body.map(x=>x.declaration||x).find(x=>x.id?.name===item.function);
 assert(node,item.function+" missing");
 assert.equal(digest(source.slice(node.body.start,node.body.end)),item.after,"Reviewed Workflow change drifted: "+item.function);
}
for(const item of knownChanges.handlerBodies){
 const {source,tree}=get(item.path),node=tree.body.map(x=>x.declaration||x).find(x=>x.id?.name===item.name);
 assert(node,item.name+" missing");
 assert.equal(digest(source.slice(node.body.start,node.body.end)),item.after,"Reviewed Worker handler change drifted: "+item.name);
}
console.log("PASS reviewed portability changes:",knownChanges.members.length+" declarations,",knownChanges.workflowActions.length+" Workflow actions,",knownChanges.handlerBodies.length+" Worker handlers");
