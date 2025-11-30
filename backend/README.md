# Corporate Calendar API

## Local setup

1. Create a virtual environment and install dependencies:
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and adjust values.
3. Apply database migrations (default SQLite DB file will be created in the backend folder):
   ```powershell
   .\.venv\Scripts\alembic upgrade head
   ```
4. Run the API locally:
   ```powershell
   uvicorn app.main:app --reload
   ```
5. Check health endpoint at `http://localhost:8000/api/v1/health` and calendar CRUD at `/api/v1/calendars`.

## Next steps
- Add authentication & RBAC.
- Implement organizations/users CRUD and event management.
- Provide seed scripts & Docker compose for shared environments.
