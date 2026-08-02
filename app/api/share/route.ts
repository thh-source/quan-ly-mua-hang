import {getChatGPTUser} from "../../chatgpt-auth";
import {ensureShareLinks} from "../../share-auth";

async function bindings(){return (await import("cloudflare:workers")).env}

export async function POST(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});await ensureShareLinks();const env=await bindings(),token=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().slice(0,8),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+30*24*60*60*1000);
 await env.DB.prepare("INSERT INTO share_links (token,label,created_at,expires_at,view_count) VALUES (?,?,?,?,0)").bind(token,"Báo cáo tổng hợp mua hàng",createdAt.toISOString(),expiresAt.toISOString()).run();
 return Response.json({token,expiresAt:expiresAt.toISOString()});
}

export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});await ensureShareLinks();const env=await bindings();const result=await env.DB.prepare("SELECT token,label,created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt,last_viewed_at AS lastViewedAt,view_count AS viewCount FROM share_links ORDER BY created_at DESC LIMIT 50").all();return Response.json({links:result.results});
}
