from django.conf import settings

CHUNK_SIZE = 64 * 1024


def file_path(user_id, item_id):
    return settings.MEDIA_ROOT / "files" / str(user_id) / "{}.bin".format(item_id)


def write_request_stream(request, path, max_size):
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".part")
    total = 0
    try:
        with open(partial, "wb") as handle:
            while True:
                chunk = request.read(CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_size:
                    raise ValueError("upload exceeds maximum size of {} bytes".format(max_size))
                handle.write(chunk)
    except ValueError:
        partial.unlink(missing_ok=True)
        raise
    partial.replace(path)
    return total


def read_stored(user_id, item_id):
    path = file_path(user_id, item_id)
    if not path.exists():
        return None
    return path.open("rb")


def delete_stored(user_id, item_id):
    path = file_path(user_id, item_id)
    path.unlink(missing_ok=True)
