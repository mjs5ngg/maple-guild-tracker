// 공용 수집의 실행 상태를 오해 없는 안내 문구로 변환합니다.
export type SyncStatus={status?:string;startedAt:string;finishedAt:string|null;failed:number};
export function syncStatusText(sync:SyncStatus|null):string{
 if(!sync)return "첫 수집 대기";
 const time=(value:string)=>new Date(value).toLocaleString("ko-KR",{hour12:false});
 if(sync.status==="running"||(!sync.status&&!sync.finishedAt))return `수집 진행 중 · ${time(sync.startedAt)} 시작`;
 if(sync.status==="interrupted")return "이전 수집 중단 · 다음 주기에 재시도";
 if(sync.status==="storage_error")return "저장 오류 · 다음 주기에 재시도";
 if(sync.status==="partial")return `일부 수집 실패 ${sync.failed}건 · ${sync.finishedAt?time(sync.finishedAt):""} · 재시도 예정`;
 return sync.finishedAt?`갱신 완료 ${time(sync.finishedAt)}`:"수집 상태 확인 필요";
}
