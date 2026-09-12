# Linux 환경 설정 갱신 시 기존 비밀을 보존하고 Edge 항목만 교체하는지 검사합니다.
import importlib.util
from pathlib import Path
import unittest


module_path = Path(__file__).with_name("update-edge-linux-config.py")
spec = importlib.util.spec_from_file_location("edge_linux_config", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EdgeLinuxConfigTest(unittest.TestCase):
    def test_replaces_only_edge_values(self):
        original = "DATABASE_URL=postgresql:///maple\nEDGE_PUBLIC_ORIGIN=https://old.old.workers.dev\nEDGE_INGEST_HMAC_SECRET=" + "a" * 64 + "\nGOOGLE_CLIENT_ID=kept\n"
        result = module.merge_config(original, "https://maple-exp-public.mjs5ng.workers.dev", "b" * 64)
        self.assertIn("DATABASE_URL=postgresql:///maple", result)
        self.assertIn("GOOGLE_CLIENT_ID=kept", result)
        self.assertNotIn("old.old.workers.dev", result)
        self.assertEqual(result.count("EDGE_PUBLIC_ORIGIN="), 1)
        self.assertEqual(result.count("EDGE_INGEST_HMAC_SECRET="), 1)

    def test_rejects_non_worker_origin(self):
        with self.assertRaises(ValueError):
            module.merge_config("", "https://example.com", "b" * 64)


if __name__ == "__main__":
    unittest.main()
