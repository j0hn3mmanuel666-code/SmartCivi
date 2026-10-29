# SmartCivi with Docker Desktop

Start Docker Desktop using Linux containers, then run from this folder:

```powershell
docker compose up --build -d --wait
docker compose ps
```

Open http://localhost:3000. The database readiness endpoint is http://localhost:3000/api/health.

This project is Express with Handlebars views, so its UI and API run together in one app container. No separate React or Nginx container is required.

Docker Desktop shows the `smartcivi` group with `app` and `db` containers. Images are `smartcivi-app:local` and `mysql:8.4`. The `smartcivi_mysql_data` volume stores the MySQL database. The `smartcivi_default` network connects the services.

The local `.env` contains generated database passwords and a session secret and is excluded from Git and the application image. On another checkout, copy `.env.example` to `.env` and replace all three placeholders before starting.

The database is a new, isolated activity database; an existing database on your computer is not imported. Startup creates missing model tables without dropping existing tables. Do not run the existing `npm run migrate` command for routine Docker startup: that script drops tables and uses a separate localhost database connection.

Useful commands:

```powershell
docker compose logs --tail=50 app db
docker compose images
docker volume inspect smartcivi_mysql_data
docker compose stop
docker compose start
docker compose down
```

`down` removes the containers and network but preserves database data. Avoid `down -v` unless you intend to delete the database. To apply source changes, rebuild with the startup command above.

Sessions currently use the application's in-memory session store. Accounts and database records persist; restarting the app requires signing in again. Register an account through the UI to use the new activity database.
