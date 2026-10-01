# scripts

Convenience wrappers. Everything they do, you can do by hand. They exist so that
nobody must remember which directory or which runtime.

| Script | What it starts |
|---|---|
| `dev.cmd` | the development server on `:8787`: the SPA with hot reload, and the Worker inside it |
| `dev-worker.cmd` | `bun run start`: builds what production deploys, and runs it on `:8787` |
| `bench-serve.cmd` | a local Frappe bench on `:8000`, through WSL |

Both use `:8787`, one origin each, so run one at a time. Use `dev.cmd` for
daily work. Use `dev-worker.cmd` to test what production does.

## Windows and WSL

The `.cmd` files are for a Windows shell. `bench-serve.cmd` goes into WSL,
because the bench runs there.

Where you keep the repository is important. Two setups work:

- **Repository on Windows, bench in WSL.** Use these scripts as they are. This
  is the more simple setup, and it is what the scripts expect.
- **Repository in WSL.** Then do not use the `.cmd` files. Use the root scripts
  from a WSL shell:

  ```bash
  bun run dev         # daily work, hot reload
  bun run start       # what production does
  ```

Do not keep the repository on the Windows file system and run `bun` against it
from WSL through `/mnt/c`. It operates, and it is sufficiently slow to make you
think that something is broken.

## macOS and Linux

Do not use this folder. Use the root scripts:

```bash
bun run dev         # daily work, hot reload
bun run start       # what production does
bun run check       # typecheck both sides, then the tests
```
