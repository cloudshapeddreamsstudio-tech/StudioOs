# docs/releases — one file for each release

Each release has one file here, named for its version: `v1.0.2.md`. The file is
the scope of the release. It is written **before** any work starts.

`docs/WORKFLOW.md` gives the full flow. Written in ASD-STE100 Simplified
Technical English.

## The rule

**No `feat/` or `fix/` branch starts until its release has a branch and a file.**

1. Malhar decides the version and the scope.
2. Create `release/vX.Y.Z` from `main`.
3. Copy `_template.md` to `vX.Y.Z.md`, on the release branch. Complete it.
4. Write one card in `docs/tasks/` for each item of the scope. Each card names
   its release.
5. Push the release branch. Then hand it to the person who does the work.

If you are about to start work and the release has no file here, stop and ask.

## The version number

| The release has | Change | Example |
|---|---|---|
| Only fault corrections, or a change that a person cannot see | PATCH | `v1.0.1` to `v1.0.2` |
| A new feature that a person can see | MINOR | `v1.0.2` to `v1.1.0` |
| A change that a studio must act on | MAJOR | `v1.4.2` to `v2.0.0` |

Go up one step at a time. Keep each release small: one theme.

## The releases

| Version | Theme | State |
|---|---|---|
| [v1.0.0](./v1.0.0.md) | Release 1: the first production release | In production, 2026-10-04 |
| [v1.0.1](./v1.0.1.md) | StudioOS operates on a site that does not have a field | In production, 2026-10-14 |
| [v1.0.2](./v1.0.2.md) | The design system: tokens and shared components | **Open** |
