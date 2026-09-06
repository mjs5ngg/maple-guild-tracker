// 지원되는 브라우저에서 비밀 정보 없는 서버 준비 상태 조회를 제공합니다.
export function registerStatusTool(){
 const context=(document as Document&{modelContext?:{registerTool(tool:unknown,options:unknown):unknown}}).modelContext;
 if(!context)return()=>{};
 const controller=new AbortController();
 try{void Promise.resolve(context.registerTool({
 name:"read_maple_server_status",description:"서버 DB와 수집기 및 소셜 로그인 설정 여부를 조회합니다. 키나 계정 정보를 반환하지 않습니다.",
 inputSchema:{type:"object",properties:{},additionalProperties:false},
 annotations:{readOnlyHint:true},
 async execute(input:unknown){
 if(!input||typeof input!=="object"||Object.keys(input).length)throw new Error("빈 객체를 입력하세요.");
 const response=await fetch("/api/status");
 if(!response.ok)throw new Error("서버 상태 조회 실패");
 return response.json();
 }
 },{signal:controller.signal})).catch(()=>{});}catch{/* 미지원 브라우저에서는 일반 화면을 유지합니다. */}
 return()=>controller.abort();
}
