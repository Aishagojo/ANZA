# Local PostgreSQL with Docker Compose

Run commands from the repository root unless stated otherwise. No Supabase account is needed.

```bash
docker compose up -d --wait postgres
docker compose ps
```

The Compose service uses the official PostgreSQL 17 image, binds to `127.0.0.1:5432`, and stores data in the persistent `contentport_postgres_data` Docker volume. On the first startup with an empty volume, it creates the `contentport` database and runs `001_offers.sql` to create `offers`, `api_requests`, and `nostr_outbox`.

The configuration lives in the project; the database files live in Docker's volume, not in Git. The example credentials are for local development only.

## Backend connection

Copy `backend/.env.example` to `backend/.env` if you have not already created it. Its database URL matches Compose:

```dotenv
DATABASE_URL=postgresql://contentport:change-me@localhost:5432/contentport
```

The PostgreSQL container does not need Node dependencies to start or initialize its tables. Running the backend still requires `npm install` in `backend/` and the other settings described in [Day 2](day-2.md).

## Inspect and stop

```bash
# Open the database shell; enter \q to exit.
docker compose exec postgres psql -U contentport -d contentport

# List the application tables.
docker compose exec postgres psql -U contentport -d contentport -c '\dt'

# Stop the container while keeping its data.
docker compose stop postgres

# Restart it.
docker compose up -d --wait postgres
```

`docker compose down` also preserves the named volume. Adding `--volumes` deletes the stored database, so do not use that option when you want to keep your offers.

## Existing volumes and later migrations

Initialization scripts run only on an empty database volume. After installing backend dependencies, apply the existing migration explicitly when needed:

```bash
cd backend
npm run migrate
```

If port 5432 is already used by another database, change the Compose host port to `127.0.0.1:5433:5432` and the backend URL port to `5433`. Do not stop an unrelated database to free the port.

Reference: [official PostgreSQL Docker image](https://hub.docker.com/_/postgres).
