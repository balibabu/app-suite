import uuid

from apps.common.testing import BaseAPITestCase, login_and_get_client

LIST_ID = "8e2b4c6a-1d3f-4e5b-9c8a-7b6d5e4f3a21"
TASK_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
BASE = "/api/v1/tasks/"


class TaskApiTests(BaseAPITestCase):
    def setUp(self):
        self.client_api, _ = login_and_get_client()
        response = self.client_api.post(
            BASE + "lists/", {"id": LIST_ID, "content": "list-cipher"}, format="json"
        )
        self.assertEqual(response.status_code, 201)

    def test_task_crud_with_list_reference(self):
        response = self.client_api.post(
            BASE + "tasks/",
            {"id": TASK_ID, "content": "task-cipher", "task_list": LIST_ID},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["task_list"], LIST_ID)
        moved = self.client_api.put(
            BASE + "tasks/" + TASK_ID + "/", {"content": "task-cipher-2"}, format="json"
        )
        self.assertEqual(moved.status_code, 200)
        self.assertIsNone(moved.data["task_list"])

    def test_task_with_unknown_list_rejected(self):
        response = self.client_api.post(
            BASE + "tasks/",
            {"id": str(uuid.uuid4()), "content": "x", "task_list": str(uuid.uuid4())},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_task_list_filter(self):
        self.client_api.post(
            BASE + "tasks/", {"id": TASK_ID, "content": "a", "task_list": LIST_ID}, format="json"
        )
        other = str(uuid.uuid4())
        self.client_api.post(BASE + "tasks/", {"id": other, "content": "b"}, format="json")
        in_list = self.client_api.get(BASE + "tasks/?task_list=" + LIST_ID)
        self.assertEqual(len(in_list.data), 1)
        self.assertEqual(in_list.data[0]["id"], TASK_ID)
        inbox = self.client_api.get(BASE + "tasks/?task_list=none")
        self.assertEqual(len(inbox.data), 1)
        self.assertEqual(inbox.data[0]["id"], other)
        bad = self.client_api.get(BASE + "tasks/?task_list=zzz")
        self.assertEqual(bad.status_code, 400)

    def test_purging_list_keeps_tasks(self):
        self.client_api.post(
            BASE + "tasks/", {"id": TASK_ID, "content": "a", "task_list": LIST_ID}, format="json"
        )
        response = self.client_api.delete(BASE + "lists/" + LIST_ID + "/?purge=true")
        self.assertEqual(response.status_code, 204)
        task = self.client_api.get(BASE + "tasks/" + TASK_ID + "/")
        self.assertEqual(task.status_code, 200)
        self.assertIsNone(task.data["task_list"])

    def test_lists_have_same_sync_semantics(self):
        listing = self.client_api.get(BASE + "lists/")
        self.assertEqual(len(listing.data), 1)
        trashed = self.client_api.delete(BASE + "lists/" + LIST_ID + "/")
        self.assertEqual(trashed.status_code, 204)
        self.assertEqual(self.client_api.get(BASE + "lists/").data, [])
        restored = self.client_api.post(BASE + "lists/" + LIST_ID + "/restore/", format="json")
        self.assertEqual(restored.status_code, 200)
