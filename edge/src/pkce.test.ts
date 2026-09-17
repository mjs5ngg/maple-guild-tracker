// Android OAuth 일회용 교환에 사용하는 PKCE S256 계산을 검증합니다.
import {expect,it} from "vitest";
import {androidCallbackScheme,pkceChallenge} from "./index";

it("RFC 7636 S256 예제와 일치",async()=>{
 expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

it("기존 앱과 신규 앱의 로그인 반환 스킴을 분리",()=>{
 expect(androidCallbackScheme("android")).toBe("guildmatefollow");
 expect(androidCallbackScheme("android-v2")).toBe("guildfollow");
});
