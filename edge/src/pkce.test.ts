// Android OAuth 일회용 교환에 사용하는 PKCE S256 계산을 검증합니다.
import {expect,it} from "vitest";
import {androidCallbackScheme,favoritesJson,pkceChallenge} from "./index";

it("RFC 7636 S256 예제와 일치",async()=>{
 expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

it("기존 앱과 신규 앱의 로그인 반환 스킴을 분리",()=>{
 expect(androidCallbackScheme("android")).toBe("guildmatefollow");
 expect(androidCallbackScheme("android-v2")).toBe("guildfollow");
});

it("즐겨찾기 JSON은 순서와 중복에 관계없이 같은 문자열이 된다",()=>{
 expect(favoritesJson(["나","가","나"])).toBe(favoritesJson(["가","나"]));
 expect(favoritesJson([])).toBe("[]");
});
