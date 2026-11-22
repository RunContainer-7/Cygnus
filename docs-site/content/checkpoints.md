---
title: Checkpoints
description: Automatic snapshots after every build turn, manual ones on demand, and a restore that actually reverts files.
---

## What a checkpoint is

A checkpoint is a copy of the project's files taken outside the project folder. Restoring it copies those files back, so a bad turn never becomes permanent.

Snapshots are deliberately stored outside the project: a restore can never leave a snapshot inside a publish or a zip.

## Automatic checkpoints

Every build turn saves one. The last **20** are kept, and older ones are pruned automatically. You do not need to do anything to get this behaviour.

## Manual checkpoints

Open **Studio → Checkpoints** and create one before a risky change — a big redesign, a file deletion, a new feature that touches everything.

Name it something you will recognise later: `before pricing rewrite` beats `checkpoint 7`.

## Restoring

Pick a checkpoint and restore it. Cygnus replaces the project's current files with the snapshot. The conversation is not rewound, so you can immediately tell the agent what changed:

> I restored a checkpoint. The pricing section is gone on purpose; rebuild it with two tiers only.

That keeps the chat context useful instead of pretending the last few turns never happened.

## What it is not

- It is not Git. There is no branching, no commit history, and no remote.
- It does not snapshot the chat, notes or extension settings.
- It does not keep more than the configured number of entries.

For real version control, export the project or copy the folder into a Git repository. The project is ordinary files; `git init` works fine.

## A safe rhythm

1. Snapshot before a large change.
2. Build and check the preview.
3. If it works, keep going.
4. If it does not, restore and rephrase the prompt.

That loop is faster than trying to talk the agent out of a broken state.
