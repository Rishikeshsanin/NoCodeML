# NoCodeML Agent Instructions

## Project identity

- Application: NoCodeML
- Repository: `Rishikeshsanin/NoCodeML`
- Project Hub app slug: `nocodeml`
- Project Hub schema: `nocodeml`

## Absolute isolation rule

NoCodeML may read, write, migrate, test, or deploy only resources explicitly registered to the `nocodeml` application scope.

Never inspect, query, alter, migrate, truncate, delete, or depend on another application's schema, tables, functions, storage buckets, secrets, credentials, queues, or deployment configuration.

## Database rules

- Read `hub.read_me_first` before any Project Hub write.
- Verify the `hub.apps` registry entry for `nocodeml` before database work.
- Require `slug = schema_name = 'nocodeml'`.
- Run `hub.assert_app_scope('nocodeml', 'nocodeml')` before app database changes.
- Use fully-qualified names such as `nocodeml.datasets`.
- Do not create NoCodeML application tables in `public`.
- Do not modify `hub`, `auth`, `storage`, `realtime`, `public`, or any other application schema from NoCodeML work.
- Do not create cross-application foreign keys or dependencies.
- Keep user-facing tables protected with appropriate access controls.
- Keep secrets out of Git and browser bundles.

## Deployment rules

- Frontend public configuration may contain only non-secret values.
- Backend/database credentials are server-only.
- Never expose Project Hub administrative/service-role credentials to the browser or ordinary application code.
- Deployment must preserve NoCodeML's schema isolation.

## Change safety

If a requested change could affect another Project Hub application or shared project-wide infrastructure, stop that change until its impact is explicitly reviewed.
