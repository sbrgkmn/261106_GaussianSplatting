import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app import server
from app import multiview_api


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(server, 'JOBS', tmp_path)
    monkeypatch.setattr(server, 'available', lambda model: True)
    return TestClient(server.app)


def image(color):
    stream = io.BytesIO()
    Image.new('RGB', (24, 16), color).save(stream, format='PNG')
    return stream.getvalue()


def files(count=2):
    return [('images', (f'photo-{i}.png', image((i, 20, 40)), 'image/png')) for i in range(count)]


def test_joint_job_preserves_all_views_and_order(client):
    source = files(3)
    source[0] = ('images', ('../../private.png', source[0][1][1], 'image/png'))
    with patch.object(server.POOL, 'submit') as submit:
        r = client.post('/api/multiview/jobs', files=source)
    assert r.status_code == 202
    job = r.json()
    assert submit.call_count == 1
    assert job['mode'] == 'multiview' and job['refinement'] is False
    assert [v['file'] for v in job['views']] == ['view-000.png', 'view-001.png', 'view-002.png']
    for entry, (_, (_, content, _)) in zip(job['views'], source):
        assert client.get(f"/api/jobs/{job['id']}/{entry['file']}").content == content
    assert client.get(f"/api/jobs/{job['id']}/job.json").status_code == 404
    assert client.post(f"/api/jobs/{job['id']}/compare").status_code == 400


@pytest.mark.parametrize('count', [1, 17])
def test_view_count_limits_are_atomic(client, count):
    assert client.post('/api/multiview/jobs', files=files(count)).status_code == 400
    assert client.get('/api/jobs').json() == []


def test_bad_images_and_duplicates_rejected(client):
    source = files()
    assert client.post('/api/multiview/jobs', files=[source[0], source[0]]).status_code == 400
    source[1] = ('images', ('bad.png', b'not an image', 'image/png'))
    assert client.post('/api/multiview/jobs', files=source).status_code == 400
    assert client.get('/api/jobs').json() == []


def test_upload_limits_and_origin(client, monkeypatch):
    assert client.post('/api/multiview/jobs', files=files(), headers={'Origin': 'https://example.com'}).status_code == 403
    monkeypatch.setattr(server, 'LIMIT', 2)
    assert client.post('/api/multiview/jobs', files=files()).status_code == 413
    monkeypatch.setattr(multiview_api, 'MAX_TOTAL', 10)
    assert client.post('/api/multiview/jobs', files=files()).status_code == 413
    assert client.get('/api/jobs').json() == []


def test_shared_queue_limit(client):
    with patch.object(server.POOL, 'submit'):
        for _ in range(6):
            assert client.post('/api/jobs', content=image('red')).status_code == 202
        assert client.post('/api/multiview/jobs', files=files()).status_code == 429
    assert len(client.get('/api/jobs').json()) == 6


def test_worker_dispatch_and_camera_export(client):
    with patch.object(server.POOL, 'submit'):
        job = client.post('/api/multiview/jobs', files=files()).json()
    path = server.folder(job['id'])
    (path / 'scene.ply').write_bytes(b'ply')
    (path / 'scene.json').write_text('{}')
    (path / 'cameras.json').write_text('{"cameras": []}')
    with patch.object(server.subprocess, 'run') as run:
        run.return_value.returncode = 0
        server.run_job(path)
    assert run.call_args.args[0][2] == 'app.multiview_worker'
    assert server.read_job(path)['status'] == 'complete'
    assert client.get(f"/api/jobs/{job['id']}/cameras.json").status_code == 200


def test_no_silent_refinement_option(client):
    assert client.post('/api/multiview/jobs?refinement=true', files=files()).status_code == 400
