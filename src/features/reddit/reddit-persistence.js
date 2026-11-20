// Reddit D1 metadata and queued candidates.

// Migrated from original Reddit scanner without changing declaration bodies.



export async function meta(env,k,v) {
  await env.DB.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(k,String(v)).run();
}

export async function queue(env,items) {
  const sql="INSERT OR IGNORE INTO jobs (id,fingerprint,title,company,source,url,description,region,published_at,discovered_at,state) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
  for(const p of items) {
    const raw=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(p.url)));
    const id=Array.from(raw).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,28);
    await env.DB.prepare(sql).bind(id,id,p.title,p.company,p.source,p.url,p.description,
      "",null,p.discovered_at,"queued").run();
  }
}
