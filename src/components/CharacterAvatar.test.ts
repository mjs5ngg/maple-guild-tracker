// 캐릭터 이미지의 확대 영역과 공식 걷기 프레임 URL을 검증합니다.
import { describe, expect, it } from "vitest";
import { avatarImageUrl, shouldAdvanceAvatarFrame } from "./CharacterAvatar";

describe("avatarImageUrl", () => {
  it("uses the enlarged crop and requested walk1 frame", () => {
    const result = new URL(avatarImageUrl("https://example.com/look/id?wmotion=W00", "A02.3"));

    expect(result.searchParams.get("action")).toBe("A02.3");
    expect(result.searchParams.get("width")).toBe("128");
    expect(result.searchParams.get("height")).toBe("128");
    expect(result.searchParams.get("x")).toBe("64");
    expect(result.searchParams.get("y")).toBe("90");
  });
});

describe("shouldAdvanceAvatarFrame", () => {
  it("pauses animation while the Android WebView is in the background", () => {
    expect(shouldAdvanceAvatarFrame("hidden")).toBe(false);
    expect(shouldAdvanceAvatarFrame("visible")).toBe(true);
  });
});
