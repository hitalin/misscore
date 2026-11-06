import { keywordLabeler } from "./keyword.js";
import { mediaLabeler } from "./media.js";
import { mentionLabeler } from "./mention.js";
import type { LabelContext, Labeler, LabelerOutput } from "./types.js";
import { urlLabeler } from "./url.js";
import { velocityLabeler } from "./velocity.js";

export const DEFAULT_LABELERS: readonly Labeler[] = [
	keywordLabeler,
	mediaLabeler,
	mentionLabeler,
	urlLabeler,
	velocityLabeler,
];

/** すべての labeler を走らせ、出力を連結する。同じ型のラベルが重複してもよい (source が違う) */
export function runLabelers(
	ctx: LabelContext,
	labelers: readonly Labeler[] = DEFAULT_LABELERS,
): LabelerOutput {
	const out: LabelerOutput = { note: [], user: [] };
	for (const labeler of labelers) {
		const r = labeler.run(ctx);
		out.note.push(...r.note);
		out.user.push(...r.user);
	}
	return out;
}

export * from "./types.js";
export {
	keywordLabeler,
	mediaLabeler,
	mentionLabeler,
	urlLabeler,
	velocityLabeler,
};
