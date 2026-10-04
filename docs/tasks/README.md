# Task cards

A task card is one piece of work, written so that you can give it to an agent
without explaining the repository first.

`docs/HANDOFF.md` gives the direction. A task card gives one job inside it.

## How to use one

Start a new session for each card. A session that holds two jobs holds neither
of them well.

Give the agent the card by path, not by copy:

```
Read docs/tasks/<name>.md and AGENTS.md. Then do the task.
Follow the "Do not break" section exactly. Stop at each "Ask first" point.
```

The agent reads `AGENTS.md`, and `AGENTS.md` routes it to everything else. Do
not paste rules into the chat. A rule that is in the chat is lost when the
session ends. A rule that is in a file is there for the next person.

## Before you accept the work

Ask the agent one question:

> Which of the three questions in `docs/SEAM.md` section 10 does this change
> touch, and what did you decide?

If it cannot answer, you cannot either, and the change is not ready.

Then run the verification in the card yourself. Do not accept a report that the
agent passed its own test. Run it.

## How a card ends

A card is finished when its "Done when" section is true, and not before. If you
find that the card is wrong, change the card and say why. That is not a
failure. It happened on the first card in this folder.

## The cards

| Card | What it does | State |
|---|---|---|
| [h1b-dev-loop.md](./h1b-dev-loop.md) | Give the SPA a fast development loop, on one origin | Done |
| [h2b-sign-out-everywhere.md](./h2b-sign-out-everywhere.md) | Finish the prize of H2: end every session of one person | Done |
| [r1-staging.md](./r1-staging.md) | Deploy staging, test each feature yourself, sign off | Done |
| [r1-production.md](./r1-production.md) | Deploy production | **Open — approved 2026-10-04** |
