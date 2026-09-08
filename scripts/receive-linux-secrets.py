# 표준 입력으로 받은 운영 설정을 Linux root 전용 새 파일에 저장합니다.
import json
import os
from pathlib import Path
import re
import sys

if os.geteuid() != 0:
    sys.exit(1)
values = json.load(sys.stdin)
required = {"DATABASE_URL", "PUBLIC_ORIGIN", "NEXON_OPERATOR_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"}
if set(values) != required or any(not isinstance(v, str) or not re.fullmatch(r"[A-Za-z0-9_.:/?=&%+@-]+", v) for v in values.values()):
    sys.exit(1)
os.umask(0o077)
directory = Path("/etc/maple-exp")
directory.mkdir(mode=0o700, exist_ok=True)
with (directory / "server.env").open("x", encoding="utf-8") as output:
    for key, value in values.items():
        output.write(f"{key}={value}\n")
    output.flush()
    os.fsync(output.fileno())
