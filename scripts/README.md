# scripts

Convenience wrappers. Everything they do, you can do by hand. They exist so that
nobody must remember which directory or which runtime.

| Script | What it starts |
|---|---|
| `dev-worker.cmd` | the Worker (API and sign-in) on `:8787` |
| `dev-app.cmd` | the SPA on `:5173`, which sends `/api` and `/auth` to `:8787` |
| `bench-serve.cmd` | a local Frappe bench on `:8000`, through WSL |

Start the Worker before the SPA. The SPA sends `/api` and `/auth` to the Worker,
so a SPA with no Worker behind it looks like a broken sign-in button.

## Windows and WSL

The `.cmd` files are for a Windows shell. `bench-serve.cmd` goes into WSL,
because the bench runs there.

Where you keep the repository is important. Two setups work:

- **Repository on Windows, bench in WSL.** Use these scripts as they are. This
  is the more simple setup, and it is what the scripts expect.
- **Repository in WSL.** Then do not use the `.cmd` files. Use the root scripts
  from a WSL shell:

  ```bash
  bun run dev:api     # terminal one
  bun run dev:app     # terminal two
  ```

Do not keep the repository on the Windows file system and run `bun` against it
from WSL through `/mnt/c`. It operates, and it is sufficiently slow to make you
think that something is broken.

## macOS and Linux

Do not use this folder. Use the root scripts:

```bash
bun run dev:api
bun run dev:app
bun run check       # typecheck both sides, then the tests
```
