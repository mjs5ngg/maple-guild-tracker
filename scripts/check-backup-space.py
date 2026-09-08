# 백업 디스크 여유 공간을 검사해 공간 부족 시 백업 실행을 중단합니다.
import os
import shutil
import sys


def enough_space(free, minimum):
    if minimum <= 0:
        raise ValueError("minimum must be positive")
    return free >= minimum


def main():
    minimum = int(os.environ.get("MAPLE_BACKUP_MIN_FREE_BYTES", 5 * 1024**3))
    for path in ("/var/lib/maple-exp-backups", "/mnt/d/MapleEXPBackups"):
        if not enough_space(shutil.disk_usage(path).free, minimum):
            print(f"백업 여유 공간 부족: {path}. 기존 파일을 보존하고 중단합니다.", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
