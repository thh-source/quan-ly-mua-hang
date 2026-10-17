async function bindings(){return (await import("cloudflare:workers")).env}

export async function ensureShareLinks(){
 const env=await bindings();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS share_links (token TEXT PRIMARY KEY, label TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, last_viewed_at TEXT, view_count INTEGER NOT NULL DEFAULT 0, owner_user_id TEXT, scope TEXT NOT NULL DEFAULT 'user')").run();
 try{await env.DB.prepare("ALTER TABLE share_links ADD COLUMN owner_user_id TEXT").run()}catch{}
 try{await env.DB.prepare("ALTER TABLE share_links ADD COLUMN scope TEXT NOT NULL DEFAULT 'user'").run()}catch{}
 await env.DB.prepare("UPDATE share_links SET scope='all' WHERE owner_user_id IS NULL").run();
}

export async function validateShareToken(token:string,recordView=false){
 if(!token||token.length<24)return false;await ensureShareLinks();const env=await bindings(),now=new Date().toISOString();
 const row=await env.DB.prepare("SELECT token,owner_user_id AS ownerUserId,scope FROM share_links WHERE token=? AND revoked_at IS NULL AND expires_at>?").bind(token,now).first<{token:string;ownerUserId:string|null;scope:string}>();
 if(!row)return false;if(recordView)await env.DB.prepare("UPDATE share_links SET last_viewed_at=?,view_count=view_count+1 WHERE token=?").bind(now,token).run();return true;
}

export async function getShareScope(token:string){
 if(!token||token.length<24)return null;await ensureShareLinks();const env=await bindings(),now=new Date().toISOString();
 return env.DB.prepare("SELECT owner_user_id AS ownerUserId,scope FROM share_links WHERE token=? AND revoked_at IS NULL AND expires_at>?").bind(token,now).first<{ownerUserId:string|null;scope:"user"|"all"}>();
}
