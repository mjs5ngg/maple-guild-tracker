// 공식 API 캐릭터 이미지를 표시하고 실패하면 이름 첫 글자를 대신 보여줍니다.
import { useEffect, useState } from "react";

interface Props {
  image: string | null;
  name: string;
  mini?: boolean;
}

export function CharacterAvatar({ image, name, mini = false }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [image]);

  return (
    <span className={mini ? "mini-avatar" : "avatar"}>
      {image && !failed
        ? <img src={image} alt={`${name} 캐릭터`} loading="lazy" onError={() => setFailed(true)} />
        : name.slice(0, 1)}
    </span>
  );
}
