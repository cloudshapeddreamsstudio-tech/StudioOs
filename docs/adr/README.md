# Architecture decision records

An ADR is a record of one decision. It says what we decided, why we decided it,
and what it costs. It is not a design document and it is not a task list.

Write an ADR when a decision changes what other people can build. If a decision
is easy to change tomorrow, do not write an ADR. Write a code comment.

## The language rule

**Write every ADR in ASD-STE100 Simplified Technical English.** This is not a
preference. It has two purposes:

1. A large language model reads these documents more reliably when each word
   has one meaning. The document then gives the same instruction to every model
   and to every person.
2. A junior engineer, or a person whose first language is not English, reads
   the decision and not the prose around it.

`docs/SEAM.md` is the example to follow.

### The rules that do most of the work

- Write short sentences. Use a maximum of 20 words in one sentence.
- Give each word one meaning. Do not use `support`, `handle`, `leverage`,
  `robust`, or `seamless`. Say what the thing does.
- Use the active voice. Write "the Worker reads the token", not "the token is
  read".
- Use one paragraph for one topic.
- Use articles. Write "the Worker", not "Worker".
- Do not use synonyms for a technical name. If it is `withDocAccess` on one
  page, it is `withDocAccess` on every page.
- Do not write with humour, metaphor, or idiom. A reader who translates the
  page must get the same meaning.

Technical names, file paths, code, and quoted error text do not change. Write
them exactly.

## How to write one

1. Copy `0000-template.md` to `NNNN-a-short-name.md`. Use the next number.
2. Complete each section. Do not remove a section. If a section is empty, write
   why it is empty.
3. Set the status. A new ADR is `Proposed`. The owner changes it to `Accepted`.
4. Link the ADR from `AGENTS.md` if it changes what a contributor may do.

## The records

| Number | Title | Status |
|---|---|---|
| [0001](./0001-studioos-provisions-its-own-doctypes.md) | StudioOS provisions its own DocTypes | Accepted |
| [0002](./0002-repository-structure.md) | The repository structure | Accepted |
| [0003](./0003-how-sessions-are-stored.md) | How sessions are stored | Accepted |
| [0004](./0004-the-development-loop.md) | The development loop, and where wrangler.jsonc lives | Accepted |

## What an ADR does not do

An ADR does not replace `docs/SEAM.md`. SEAM gives the rules that all of the
code obeys. An ADR gives one decision and the evidence for it. When an ADR
changes a rule in SEAM, the ADR says so, and SEAM gets an amendment that points
back to the ADR.
