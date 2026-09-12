# 표준 입력의 공개 주소와 수집 서명을 Linux root 전용 환경 파일에 원자적으로 반영합니다.
import json
import os
from pathlib import Path
import re
import sys
import tempfile


def merge_config(original: str, origin: str, secret: str):
    if not re.fullmatch(r"https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev", origin):
        raise ValueError("invalid origin")
    if not re.fullmatch(r"[A-Za-z0-9_-]{48,128}", secret):
        raise ValueError("invalid secret")
    retained = [line for line in original.splitlines() if not line.startswith(("EDGE_PUBLIC_ORIGIN=", "EDGE_INGEST_HMAC_SECRET="))]
    return "\n".join(retained + [f"EDGE_PUBLIC_ORIGIN={origin}", f"EDGE_INGEST_HMAC_SECRET={secret}", ""])


def main():
    if os.geteuid() != 0:
        raise PermissionError("root required")
    values = json.load(sys.stdin)
    if set(values) != {"origin", "secret"}:
        raise ValueError("invalid input")
    path = Path("/etc/maple-exp/server.env")
    updated = merge_config(path.read_text(encoding="utf-8-sig"), values["origin"], values["secret"])
    os.umask(0o077)
    descriptor, temporary = tempfile.mkstemp(prefix=".server-env-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            output.write(updated)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == "__main__":
    main()
