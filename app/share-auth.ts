async function bindings(){return (await import("cloudflare:workers")).env}

export async function ensureShareLinks(){
 const env=await bindings();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS share_links (token TEXT PRIMARY KEY, label TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, last_viewed_at TEXT, view_count INTEGER NOT NULL DEFAULT 0)").run();
}

export async function validateShareToken(token:string,recordView=false){
 if(!token||token.length<24)return false;await ensureShareLinks();const env=await bindings(),now=new Date().toISOString();
 const row=await env.DB.prepare("SELECT token FROM share_links WHERE token=? AND revoked_at IS NULL AND expires_at>?").bind(token,now).first();
 if(!row)return false;if(recordView)await env.DB.prepare("UPDATE share_links SET last_viewed_at=?,view_count=view_count+1 WHERE token=?").bind(now,token).run();return true;
}
