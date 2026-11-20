// Production-compatible extraction: no business rules changed.
export const getMeta = async (env,k) => (await env.DB.prepare("SELECT value FROM meta WHERE key=?").bind(k).first())?.value || "";
export const putMeta = async (env,k,v) => env.DB.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k,String(v)).run();
