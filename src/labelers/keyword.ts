import { isKeyWordIncluded, noteContentForKeywordCheck } from "../keywords.js";
import { DAY_MS } from "../labels.js";
import type { Labeler, LabelerOutput } from "./types.js";

/** meta.prohibitedWords / sensitiveWords による判定。NoteCreateService と同じ本文を見る */
export const keywordLabeler: Labeler = {
	id: "keyword",
	run({ note, config }) {
		const out: LabelerOutput = { note: [], user: [] };
		const content = noteContentForKeywordCheck(note);
		if (isKeyWordIncluded(content, config.prohibitedWords)) {
			out.note.push({
				type: "prohibited_word",
				source: "keyword",
				ttlMs: null,
				reason: "matches meta.prohibitedWords",
			});
		}
		if (isKeyWordIncluded(content, config.sensitiveWords)) {
			out.note.push({
				type: "sensitive_word",
				source: "keyword",
				ttlMs: 30 * DAY_MS,
				reason: "matches meta.sensitiveWords",
			});
		}
		return out;
	},
};
