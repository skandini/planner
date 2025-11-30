from fastapi.testclient import TestClient
from app.main import app
import json

client = TestClient(app)
resp = client.get('/api/v1/events/')
events = resp.json()

event_25 = [e for e in events if e['title'] == '25']
if event_25:
    print('Событие "25" с API:')
    print(json.dumps(event_25[0], indent=2, default=str))
else:
    print('Событие "25" не найдено')
    print(f'Всего событий: {len(events)}')
    if events:
        print('Первое событие:')
        print(json.dumps(events[0], indent=2, default=str))


