import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import override_settings

from apps.common.testing import BaseAPITestCase, login_and_get_client

FILE_ID = "3f8d1c2a-9b4e-4d6f-8a1c-5e7b9d0f2a33"
BASE = "/api/v1/files/"


class FileApiTests(BaseAPITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media_dir = TemporaryDirectory()
        cls.media_override = override_settings(MEDIA_ROOT=Path(cls.media_dir.name))
        cls.media_override.enable()
        cls.addClassCleanup(cls.media_override.disable)
        cls.addClassCleanup(cls.media_dir.cleanup)

    def setUp(self):
        self.client_api, _ = login_and_get_client()

    def create_file_meta(self, file_id=FILE_ID, meta="meta-cipher"):
        return self.client_api.post(
            BASE, {"id": file_id, "meta_ciphertext": meta, "format_version": 1}, format="json"
        )

    def upload_content(self, file_id=FILE_ID, payload=b"encrypted-bytes-01"):
        return self.client_api.put(
            BASE + file_id + "/content/",
            data=payload,
            content_type="application/octet-stream",
        )

    def test_upload_and_download_roundtrip(self):
        meta = self.create_file_meta()
        self.assertEqual(meta.status_code, 201)
        self.assertFalse(meta.data["stored"])
        upload = self.upload_content()
        self.assertEqual(upload.status_code, 200)
        self.assertTrue(upload.data["stored"])
        self.assertEqual(upload.data["size"], len(b"encrypted-bytes-01"))
        download = self.client_api.get(BASE + FILE_ID + "/content/")
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b"".join(download.streaming_content), b"encrypted-bytes-01")
        me = self.client_api.get("/api/v1/auth/me/")
        self.assertEqual(me.data["storage_used"], len(b"encrypted-bytes-01"))

    def test_upload_twice_conflicts(self):
        self.create_file_meta()
        self.upload_content()
        again = self.upload_content(payload=b"other")
        self.assertEqual(again.status_code, 409)

    def test_download_before_upload_404(self):
        self.create_file_meta()
        response = self.client_api.get(BASE + FILE_ID + "/content/")
        self.assertEqual(response.status_code, 404)

    def test_trashed_file_blocks_upload_but_allows_download(self):
        self.create_file_meta()
        self.upload_content()
        trashed = self.client_api.delete(BASE + FILE_ID + "/")
        self.assertEqual(trashed.status_code, 204)
        blocked = self.client_content = self.client_api.put(
            BASE + FILE_ID + "/content/",
            data=b"x",
            content_type="application/octet-stream",
        )
        self.assertEqual(blocked.status_code, 409)
        download = self.client_api.get(BASE + FILE_ID + "/content/")
        self.assertEqual(download.status_code, 200)

    def test_purge_frees_quota(self):
        self.create_file_meta()
        self.upload_content()
        purged = self.client_api.delete(BASE + FILE_ID + "/?purge=true")
        self.assertEqual(purged.status_code, 204)
        me = self.client_api.get("/api/v1/auth/me/")
        self.assertEqual(me.data["storage_used"], 0)
        response = self.client_api.get(BASE + FILE_ID + "/content/")
        self.assertEqual(response.status_code, 404)

    def test_meta_update_conflicts(self):
        self.create_file_meta()
        update = self.client_api.put(
            BASE + FILE_ID + "/", {"meta_ciphertext": "meta-cipher-2", "base_version": 1}, format="json"
        )
        self.assertEqual(update.status_code, 200)
        stale = self.client_api.put(
            BASE + FILE_ID + "/", {"meta_ciphertext": "meta-cipher-3", "base_version": 1}, format="json"
        )
        self.assertEqual(stale.status_code, 409)

    def test_quota_enforced(self):
        self.create_file_meta()
        with override_settings(USER_STORAGE_LIMIT=4):
            response = self.upload_content(payload=b"way-too-many-bytes")
        self.assertEqual(response.status_code, 413)
        listing = self.client_api.get(BASE)
        self.assertEqual(listing.data[0]["stored"], False)

    def test_max_file_size_enforced(self):
        self.create_file_meta()
        with override_settings(MAX_FILE_SIZE=4):
            response = self.upload_content(payload=b"way-too-many-bytes")
        self.assertEqual(response.status_code, 413)

    def test_file_folders_crud_and_assignment(self):
        root_id = "5a1c2d3e-4f5b-4c6d-8e7f-9a0b1c2d3e4f"
        root = self.client_api.put(
            BASE + "folders/" + root_id + "/",
            {"format_version": 1, "content": "folder-cipher", "parent": None},
            format="json",
        )
        self.assertEqual(root.status_code, 201)
        self.assertIsNone(root.data["parent"])

        nested_id = "6b2d3e4f-5a6c-4d7e-8f9a-0b1c2d3e4f5a"
        nested = self.client_api.put(
            BASE + "folders/" + nested_id + "/",
            {"format_version": 1, "content": "nested-cipher", "parent": root_id},
            format="json",
        )
        self.assertEqual(nested.status_code, 201)
        self.assertEqual(nested.data["parent"], root_id)

        assigned = self.client_api.put(
            BASE + FILE_ID + "/",
            {"meta_ciphertext": "meta-cipher", "folder": nested_id},
            format="json",
        )
        self.assertIn(assigned.status_code, (200, 201))
        self.assertEqual(assigned.data["folder"], nested_id)

        inFolder = self.client_api.get(BASE + "?folder=" + nested_id)
        self.assertEqual(inFolder.status_code, 200)
        self.assertTrue(any(item["id"] == FILE_ID for item in inFolder.data))

        children = self.client_api.get(BASE + "folders/?parent=" + root_id)
        self.assertEqual(children.status_code, 200)
        self.assertTrue(any(item["id"] == nested_id for item in children.data))

    def test_trashing_folder_cascades_to_files(self):
        root_id = "7c3e4f5a-6b7d-4e8f-8a0b-1c2d3e4f5a6b"
        self.client_api.put(
            BASE + "folders/" + root_id + "/",
            {"format_version": 1, "content": "folder-cipher"},
            format="json",
        )
        self.client_api.put(
            BASE + FILE_ID + "/",
            {"meta_ciphertext": "meta-cipher", "folder": root_id},
            format="json",
        )
        trashed = self.client_api.delete(BASE + "folders/" + root_id + "/")
        self.assertEqual(trashed.status_code, 204)
        listing = self.client_api.get(BASE)
        self.assertFalse(any(item["id"] == FILE_ID for item in listing.data))
        restore = self.client_api.post(BASE + "folders/" + root_id + "/restore/")
        self.assertEqual(restore.status_code, 200)
        self.assertIsNone(restore.data["deleted_at"])
        listing = self.client_api.get(BASE)
        self.assertTrue(any(item["id"] == FILE_ID for item in listing.data))

    def test_purging_folder_frees_storage(self):
        root_id = "8d4f5a6b-7c8e-4f9a-8b0c-2d3e4f5a6b7c"
        self.client_api.put(
            BASE + "folders/" + root_id + "/",
            {"format_version": 1, "content": "folder-cipher"},
            format="json",
        )
        self.create_file_meta()
        self.client_api.put(
            BASE + FILE_ID + "/",
            {"meta_ciphertext": "meta-cipher", "folder": root_id},
            format="json",
        )
        self.upload_content()
        purged = self.client_api.delete(BASE + "folders/" + root_id + "/?purge=true")
        self.assertEqual(purged.status_code, 204)
        me = self.client_api.get("/api/v1/auth/me/")
        self.assertEqual(me.data["storage_used"], 0)
        gone = self.client_api.get(BASE + FILE_ID + "/")
        self.assertEqual(gone.status_code, 404)
