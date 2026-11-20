// Work only with the existing loaded Reddit thread DOM. No extra navigation,
// HTTP requests or new tabs. DOM excerpts complement the page body text.
const flatten=x=>Array.isArray(x)?x:Array.isArray(x?.items)?x.items.map(y=>y.value):[];
export function enrichRedditThreadSnapshot(initial,extra=[]){
 const nodes=[...flatten(initial?.nodes)];
 const text=String(initial?.bodyText||"");
 const chunks=[],seen=new Set();
 for(const page of extra){
  for(const node of flatten(page?.nodes)){
   if(!node||typeof node!=="object")continue;
   nodes.push(node);
   const label=[node.text,node.innerText,node.description,node.name,node.label,
     node.accessibleName,node.parent?.text].find(v=>typeof v==="string"&&v.trim().length>45);
   if(!label)continue;
   const one=label.replace(/\s+/g," ").trim().slice(0,1200);
   const key=one.slice(0,120).toLowerCase();
   if(seen.has(key)||text.includes(one.slice(0,80)))continue;
   seen.add(key);
   chunks.push(one);
   if(chunks.length>=55)break;
  }
  if(chunks.length>=55)break;
 }
 const supplement=chunks.join("\n");
 return {...initial,nodes,
   bodyText:(text+"\nVISIBLE COMMENT AND POST DOM EXCERPTS:\n"+supplement).slice(0,26000),
   evidence_meta:{initial_body_chars:text.length,dom_excerpts:chunks.length,
     total_nodes:nodes.length}};
}
