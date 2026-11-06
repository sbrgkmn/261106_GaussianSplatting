import io
from unittest.mock import patch
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from app import server

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(server, 'JOBS', tmp_path)
    return TestClient(server.app)

def test_upload_validation(client):
    assert client.post('/api/jobs', content=b'not an image').status_code == 400
    assert client.post('/api/jobs', content=b'a', headers={'Origin':'https://example.com'}).status_code == 403
    assert client.get('/api/jobs/not-a-job').status_code == 404

def test_job_and_asset_isolation(client):
    image = io.BytesIO()
    Image.new('RGB', (8, 8)).save(image, format='PNG')
    with patch.object(server.POOL, 'submit'):
        r = client.post('/api/jobs', content=image.getvalue())
    assert r.status_code == 202
    job = r.json()
    assert client.get('/api/jobs/'+job['id']).json()['status'] == 'queued'
    assert client.get('/api/jobs/'+job['id']+'/input.png').status_code == 200
    assert client.get('/api/jobs/'+job['id']+'/job.json').status_code == 404
    assert client.get('/api/jobs/'+job['id']+'/scene.ply').status_code == 404

def test_failed_worker_surfaces_error(client, tmp_path):
    path=tmp_path / ('a'*32)
    path.mkdir()
    server.update(path, status='queued')
    with patch.object(server.subprocess, 'run', side_effect=RuntimeError('test GPU failure')):
        server.run_job(path)
    assert server.read_job(path)['status'] == 'failed'
    assert 'test GPU failure' in server.read_job(path)['message']
