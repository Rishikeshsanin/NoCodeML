# NoCodeML — Supabase Project Hub Rules

This repository uses the shared Supabase **Project Hub** only through the dedicated NoCodeML application scope.

## Assigned scope

- App slug: `nocodeml`
- Schema: `nocodeml`
- Repository: `Rishikeshsanin/NoCodeML`

The slug and schema must match exactly.

## Before every database change

1. Read `hub.read_me_first`.
2. Verify the NoCodeML row in `hub.apps`.
3. Confirm its repository is `Rishikeshsanin/NoCodeML` and its schema is `nocodeml`.
4. Run `select hub.assert_app_scope('nocodeml', 'nocodeml');`.
5. Inspect only the `nocodeml` schema and NoCodeML-registered resources.
6. Apply only fully-qualified `nocodeml.*` changes.
7. Verify the result and run Supabase security/performance advisors after meaningful schema or policy work.

## Forbidden from NoCodeML work

- Creating application tables in `public`.
- Reading or changing another app schema.
- Cross-app foreign keys or dependencies.
- Unscoped `DROP`, `TRUNCATE`, `DELETE`, or `ALTER` operations.
- Disabling access controls as a shortcut.
- Changing project-wide Auth, keys, region, plan, or shared infrastructure for an app-specific task.
- Exposing database passwords, secret keys, service-role keys, or other server secrets to frontend code.

## Backend connectivity

NoCodeML's FastAPI backend may connect to Postgres only with a server-side Project Hub database connection configured so all application SQL resolves to the `nocodeml` schema. Migration tooling must explicitly target the same schema.

## Frontend connectivity

The React frontend must never receive privileged Project Hub database credentials. Browser-visible environment variables are treated as public.
