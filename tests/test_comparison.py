import io
from unittest.mock import patch
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app import server
from app.scene_metadata import describe

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setattr(server,'JOBS',tmp_path)
    monkeypatch.setattr(server,'available',lambda model: True)
    return TestClient(server.app)

def photo():
    b=io.BytesIO();Image.new('RGB',(16,12)).save(b,format='PNG');return b.getvalue()

def test_comparison_identical_source_and_parameters(client):
    with patch.object(server.POOL,'submit') as submit:
        response=client.post('/api/jobs?models=sharp,infinisplat,zipsplat&focal_mm=24',content=photo())
    assert response.status_code==202
    jobs=response.json()
    assert submit.call_count==3
    assert len({j['comparison'] for j in jobs})==1
    assert len({j['source_hash'] for j in jobs})==1
    assert {j['model'] for j in jobs}=={'sharp','infinisplat','zipsplat'}
    assert all(j['focal_mm']==24 for j in jobs)
    assert all(client.get('/api/jobs/'+j['id']+'/input.png').content==photo() for j in jobs)

@pytest.mark.parametrize('query',['models=nope','models=sharp,sharp','focal_mm=nan','focal_mm=0','focal_mm=abc'])
def test_invalid_settings(client,query):
    assert client.post('/api/jobs?'+query,content=photo()).status_code==400
    assert client.get('/api/jobs').json()==[]

def test_reuse_preserves_previous_result(client):
    with patch.object(server.POOL,'submit'):
        first=client.post('/api/jobs',content=photo()).json()
        r=client.post('/api/jobs/'+first['id']+'/compare?models=infinisplat,zipsplat')
    assert r.status_code==202
    assert len(r.json())==2
    assert client.get('/api/jobs/'+first['id']).json()==first

def test_batch_capacity_is_atomic(client):
    with patch.object(server.POOL,'submit'):
        for _ in range(4):
            assert client.post('/api/jobs',content=photo()).status_code==202
        assert client.post('/api/jobs?models=sharp,infinisplat,zipsplat',content=photo()).status_code==429
    assert len(client.get('/api/jobs').json())==4

def test_focus_ignores_off_center_background():
    foreground=np.tile([0,0,10],(150,1))
    sky=np.tile([100,100,100],(500,1))
    meta=describe(np.concatenate([foreground,sky]),100,100,[[100,0,50],[0,100,50],[0,0,1]])
    assert meta['depth']==10

def test_empty_geometry_rejected():
    with pytest.raises(ValueError):
        describe(np.array([[0,0,-1],[np.nan,0,1]]),100,100,np.eye(3))
