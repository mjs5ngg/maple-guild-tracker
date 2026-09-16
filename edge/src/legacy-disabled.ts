// 종료된 중앙 수집 Worker가 어떤 요청에도 데이터베이스를 쓰지 못하게 차단합니다.
const json=(value:unknown,status:number)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});

export default {
 async fetch(){return json({error:"중앙 수집 서비스가 종료되었습니다."},410);}
} satisfies ExportedHandler;
