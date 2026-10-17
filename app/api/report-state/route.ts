import {getShareScope,validateShareToken} from "../../share-auth";
import {readAllWorkspaces,readWorkspace} from "../../state-store";

export async function GET(request:Request){
 const token=new URL(request.url).searchParams.get("token")||"";if(!await validateShareToken(token))return Response.json({error:"Link không hợp lệ"},{status:401});const share=await getShareScope(token);if(!share)return Response.json({error:"Link không hợp lệ"},{status:401});if(share.scope==="all")return Response.json({data:await readAllWorkspaces(),scope:"all"});const row=share.ownerUserId?await readWorkspace(share.ownerUserId):null;return Response.json({data:row?JSON.parse(row.payload):null,updatedAt:row?.updated_at||null,version:row?.version||0,scope:"user"});
}
