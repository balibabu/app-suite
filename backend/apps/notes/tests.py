import time
import uuid
from urllib.parse import urlencode

from django.utils import timezone

from apps.common.testing import BaseAPITestCase, login_and_get_client

from .models import Note, NoteFolder

NOTE_ID = "6c1a2f2e-4f7a-4d8b-9a7a-2f1c3b5d7e91"
BASE = "/api/v1/notes/"
FOLDERS = "/api/v1/notes/folders/"


class NoteApiTests(BaseAPITestCase):
    def setUp(self):
        self.client_api, _ = login_and_get_client()

    def create_note(self, content="ciphertext-v1", note_id=NOTE_ID):
        return self.client_api.post(
            BASE, {"id": note_id, "content": content, "format_version": 1}, format="json"
        )

    def test_create_and_list(self):
        response = self.create_note()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["item_version"], 1)
        listing = self.client_api.get(BASE)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 1)
        self.assertEqual(listing.data[0]["content"], "ciphertext-v1")

    def test_duplicate_create_conflicts(self):
        self.create_note()
        response = self.create_note()
        self.assertEqual(response.status_code, 409)

    def test_create_requires_client_id(self):
        response = self.client_api.post(BASE, {"content": "x"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_put_upsert_creates(self):
        response = self.client_api.put(
            BASE + NOTE_ID + "/", {"content": "ciphertext-v1"}, format="json"
        )
        self.assertEqual(response.status_code, 201)

    def test_update_and_version_conflict(self):
        self.create_note()
        update = self.client_api.put(
            BASE + NOTE_ID + "/", {"content": "ciphertext-v2", "base_version": 1}, format="json"
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.data["item_version"], 2)
        stale = self.client_api.put(
            BASE + NOTE_ID + "/", {"content": "ciphertext-v3", "base_version": 1}, format="json"
        )
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data["current"]["item_version"], 2)
        last_write = self.client_api.put(
            BASE + NOTE_ID + "/", {"content": "ciphertext-v4"}, format="json"
        )
        self.assertEqual(last_write.status_code, 200)
        self.assertEqual(last_write.data["content"], "ciphertext-v4")

    def test_retrieve(self):
        self.create_note()
        response = self.client_api.get(BASE + NOTE_ID + "/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], NOTE_ID)

    def test_trash_restore_purge(self):
        self.create_note()
        removed = self.client_api.delete(BASE + NOTE_ID + "/")
        self.assertEqual(removed.status_code, 204)
        self.assertEqual(self.client_api.get(BASE).data, [])
        trashed = self.client_api.get(BASE + "?trash=true")
        self.assertEqual(len(trashed.data), 1)
        restored = self.client_api.post(BASE + NOTE_ID + "/restore/", format="json")
        self.assertEqual(restored.status_code, 200)
        self.assertIsNone(restored.data["deleted_at"])
        purged = self.client_api.delete(BASE + NOTE_ID + "/?purge=true")
        self.assertEqual(purged.status_code, 204)
        self.assertFalse(Note.objects.exists())

    def test_delta_sync_returns_changed_items(self):
        self.create_note()
        marker = timezone.now()
        time.sleep(0.01)
        update = self.client_api.put(BASE + NOTE_ID + "/", {"content": "ciphertext-v2"}, format="json")
        self.assertEqual(update.status_code, 200)
        other = self.create_note(note_id=str(uuid.uuid4()))
        self.assertEqual(other.status_code, 201)
        delta = self.client_api.get(BASE + "?" + urlencode({"updated_since": marker.isoformat()}))
        self.assertEqual(delta.status_code, 200)
        self.assertEqual(len(delta.data), 2)

    def test_updated_since_rejects_naive_datetime(self):
        response = self.client_api.get(BASE + "?updated_since=2026-01-01T00:00:00")
        self.assertEqual(response.status_code, 400)

    def test_invalid_uuid_returns_404(self):
        response = self.client_api.get(BASE + "not-a-uuid/")
        self.assertEqual(response.status_code, 404)

    def test_other_user_isolation(self):
        self.create_note()
        other_client, _ = login_and_get_client("bob", "another password")
        listing = other_client.get(BASE)
        self.assertEqual(listing.data, [])
        self.assertEqual(other_client.get(BASE + NOTE_ID + "/").status_code, 404)

    def build_tree(self):
        root = str(uuid.uuid4())
        child = str(uuid.uuid4())
        grandchild = str(uuid.uuid4())
        note_root = str(uuid.uuid4())
        note_child = str(uuid.uuid4())
        for folder_id, parent in ((root, None), (child, root), (grandchild, child)):
            response = self.client_api.put(
                FOLDERS + folder_id + "/",
                {"content": f"folder-{folder_id}", "format_version": 1, "parent": parent},
                format="json",
            )
            self.assertEqual(response.status_code, 201)
        for note_id, folder in ((note_root, root), (note_child, child)):
            response = self.client_api.put(
                BASE + note_id + "/",
                {"content": f"note-{note_id}", "format_version": 1, "folder": folder},
                format="json",
            )
            self.assertEqual(response.status_code, 201)
        return root, child, grandchild, note_root, note_child

    def test_folder_trash_cascades_to_descendants(self):
        root, child, grandchild, note_root, note_child = self.build_tree()
        removed = self.client_api.delete(FOLDERS + root + "/")
        self.assertEqual(removed.status_code, 204)
        self.assertEqual(self.client_api.get(FOLDERS).data, [])
        self.assertEqual(self.client_api.get(BASE).data, [])
        self.assertEqual(len(self.client_api.get(FOLDERS + "?trash=true").data), 3)
        self.assertEqual(len(self.client_api.get(BASE + "?trash=true").data), 2)

    def test_folder_restore_cascades_to_descendants(self):
        root, child, grandchild, note_root, note_child = self.build_tree()
        self.client_api.delete(FOLDERS + root + "/")
        restored = self.client_api.post(FOLDERS + root + "/restore/", format="json")
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(len(self.client_api.get(FOLDERS).data), 3)
        self.assertEqual(len(self.client_api.get(BASE).data), 2)
        self.assertEqual(self.client_api.get(FOLDERS + "?trash=true").data, [])
        self.assertEqual(self.client_api.get(BASE + "?trash=true").data, [])

    def test_folder_purge_cascades_to_descendants(self):
        root, child, grandchild, note_root, note_child = self.build_tree()
        purged = self.client_api.delete(FOLDERS + root + "/?purge=true")
        self.assertEqual(purged.status_code, 204)
        self.assertFalse(NoteFolder.objects.exists())
        self.assertFalse(Note.objects.exists())
