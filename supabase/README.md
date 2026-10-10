# FramePuzzle Supabase setup

The migration creates the private `photo-rolls` Storage bucket, the `photo_rolls` metadata table, and RLS policies that restrict every image and row to its authenticated owner.

## Apply to the hosted project

1. In `supabase-config.js`, add the project publishable key. Never add a secret or service-role key to browser code.
2. Authenticate the local CLI with `supabase login`.
3. Link the project with `supabase link --project-ref tzhsuyvifbcpyyprrhzn`. The CLI will request the database password.
4. Run `supabase db push` to apply the migration.
5. Run `supabase config push --project-ref tzhsuyvifbcpyyprrhzn` to enable Anonymous Sign-ins from `config.toml`.

After that, selecting **download roll** downloads the PNG immediately and uploads the exact same Blob to `photo-rolls/<anonymous-user-id>/...`.
