# 백업 여유 공간 검사의 경계값과 설정 오류를 검증합니다.
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("check_backup_space", Path(__file__).with_name("check-backup-space.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SpaceTests(unittest.TestCase):
    def test_boundary(self):
        self.assertFalse(module.enough_space(99, 100))
        self.assertTrue(module.enough_space(100, 100))
        self.assertTrue(module.enough_space(101, 100))

    def test_invalid_limit(self):
        for limit in (0, -1):
            with self.assertRaises(ValueError):
                module.enough_space(100, limit)


if __name__ == "__main__":
    unittest.main()
