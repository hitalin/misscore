import type { Labeler, LabelerOutput } from "./types.js";

/**
 * DriveFile の推定値 (maybeSensitive / maybePorn) からノートラベルを付ける。
 * x-algorithm の nsfw_tweet_media 側効果ルール (label 3/4) に相当する。
 */
export const mediaLabeler: Labeler = {
	id: "media",
	run({ note, config }) {
		const out: LabelerOutput = { note: [], user: [] };
		const porn = note.files.some((f) => f.maybePorn === true);
		const sensitive = note.files.some((f) => f.maybeSensitive === true);
		if (porn && config.trustMaybePorn) {
			out.note.push({
				type: "nsfw_high_precision",
				source: "media",
				ttlMs: null,
				reason: "file.maybePorn",
			});
		}
		if (sensitive || porn) {
			out.note.push({
				type: "nsfw_high_recall",
				source: "media",
				ttlMs: null,
				reason: "file.maybeSensitive",
			});
		}
		return out;
	},
};
