from __future__ import annotations

import requests

API_BASE_URL = "http://localhost:8000/api/v1"


def test_login(email: str, password: str) -> None:
    url = f"{API_BASE_URL}/auth/login"
    payload = {"email": email, "password": password}
    
    print(f"Testing login endpoint: {url}")
    print(f"Payload: {payload}")
    
    try:
        response = requests.post(url, json=payload)
        print(f"Status code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Success! Access token: {data.get('access_token', 'N/A')[:20]}...")
        else:
            print(f"Error: {response.status_code}")
    except requests.exceptions.ConnectionError:
        print("ERROR: Cannot connect to backend. Is uvicorn running?")
    except Exception as e:
        print(f"ERROR: {e}")


if __name__ == "__main__":
    test_login("bob@example.com", "Password123!")



