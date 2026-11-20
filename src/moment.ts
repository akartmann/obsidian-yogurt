import { moment as obsidianMoment } from "obsidian";
import type momentType from "moment";

/** Obsidian's bundled moment, typed as callable (its d.ts exports the namespace). */
export const moment = obsidianMoment as unknown as typeof momentType;
