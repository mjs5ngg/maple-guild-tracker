// 따라잡기 보고서의 탭 간 세션 상태와 그룹 선택 규칙을 정의합니다.
export type SortKey="today"|"period"|"average"|"catchup";
export type Direction="asc"|"desc";
export type ChaseWorkspace={periodDays:7|30;selected:string[];sortKey:SortKey;direction:Direction};

export const initialChaseWorkspace=():ChaseWorkspace=>({periodDays:30,selected:[],sortKey:"catchup",direction:"asc"});
export const canToggleWholeGroup=(count:number)=>count>0&&count<=10;
