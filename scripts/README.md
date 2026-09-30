# scripts

Convenience wrappers. Everything they do, you can do by hand. They exist so that
nobody must remember which directory or which runtime.

| Script | What it starts |
|---|---|
| `dev-worker.cmd` | builds the SPA, then the Worker on `:8787`, which serves both |
| `bench-serve.cmd` | a local Frappe bench on `:8000`, through WSL |

There is no separate SPA server. The Worker serves the built SPA and the API on
one origin, so run `dev-worker.cmd` again after a change to the SPA.

## Windows and WSL

The `.cmd` files are for a Windows shell. `bench-serve.cmd` goes into WSL,
because the bench runs there.

Where you keep the repository is important. Two setups work:

- **Repository on Windows, bench in WSL.** Use these scripts as they are. This
  is the more simple setup, and it is what the scripts expect.
- **Repository in WSL.** Then do not use the `.cmd` files. Use the root scripts
  from a WSL shell:

  ```bash
  bun run start
  ```

Do not keep the repository on the Windows file system and run `bun` against it
from WSL through `/mnt/c`. It operates, and it is sufficiently slow to make you
think that something is broken.

## macOS and Linux

Do not use this folder. Use the root scripts:

```bash
bun run start
bun run check       # typecheck both sides, then the tests
```
