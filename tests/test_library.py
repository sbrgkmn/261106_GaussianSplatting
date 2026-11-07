import json
from fastapi.testclient import TestClient
from app import server

def test_library_serves_only_published_assets(tmp_path, monkeypatch):
    monkeypatch.setattr(server, 'DATA', tmp_path)
    folder=tmp_path/'library'/'test-capture';folder.mkdir(parents=True)
    (folder/'manifest.json').write_text(json.dumps({'title':'Test','credit':'Local','source':'/capture.html'}))
    (folder/'scene.ply').write_bytes(b'ply\n')
    (folder/'private.txt').write_text('not published')
    client=TestClient(server.app)
    assert client.get('/api/library').json()[0]['url']=='/api/library/test-capture/scene.ply'
    assert client.get('/api/library/test-capture/scene.ply').content==b'ply\n'
    assert client.get('/api/library/test-capture/private.txt').status_code==404
    assert client.get('/api/library/bad.name/scene.ply').status_code==404

def test_training_lock_blocks_new_gpu_jobs(tmp_path, monkeypatch):
    monkeypatch.setattr(server,'DATA',tmp_path)
    (tmp_path/'reconstruction.lock').touch()
    client=TestClient(server.app)
    assert client.post('/api/multiview/jobs').status_code==409
    assert client.get('/api/library').status_code==200
