import { TOOLKIT, type ToolAction } from "./toolkit";

export type MoveAction = ToolAction;

export type Move = {
  app: string;
  title: string;
  blurb: string;
  /** Set when the move writes real code or a report. */
  tool?: string;
  /** Set when the move opens a real Cygnus surface instead. */
  action?: MoveAction;
};

/**
 * One move per product. There are no prompt cards: a move either opens a
 * Cygnus surface or runs a real generator/analysis in lib/toolkit.ts.
 */
export const MOVES: Move[] = TOOLKIT.map(({ app, id, title, blurb, action }) => ({
  app,
  title,
  blurb,
  action,
  tool: action ? undefined : id,
}));
