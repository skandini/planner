from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

rooms = [
    {
        "name": "Переговорка 301",
        "capacity": 10,
        "location": "3 этаж",
        "equipment": "Проектор, доска, видеоконференция",
    },
    {
        "name": "Переговорка 205",
        "capacity": 6,
        "location": "2 этаж",
        "equipment": "Проектор",
    },
    {
        "name": "Конференц-зал",
        "capacity": 20,
        "location": "1 этаж",
        "equipment": "Проектор, микрофоны, сцена",
    },
    {
        "name": "Малый зал",
        "capacity": 4,
        "location": "2 этаж",
        "equipment": "Доска",
    },
]

print("Creating test rooms...")
for room in rooms:
    response = client.post("/api/v1/rooms/", json=room)
    if response.status_code == 201:
        print(f"OK Created: {response.json()['name']}")
    else:
        print(f"ERROR: {response.status_code} - {response.text}")

print("\nDone! Test rooms created.")

