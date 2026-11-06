import { extractUrls, hostMatches } from "../keywords.js";
import { DAY_MS } from "../labels.js";
import type { Labeler, LabelerOutput } from "./types.js";

/** botmaker 2002/20790 相当: 悪性ドメインを含むノートに malicious_url と do_not_amplify */
export const urlLabeler: Labeler = {
	id: "url",
	run({ note, config }) {
		const out: LabelerOutput = { note: [], user: [] };
		if (config.maliciousDomains.length === 0) return out;
		const bad = extractUrls(note.text).find((u) =>
			hostMatches(u.hostname, config.maliciousDomains),
		);
		if (bad === undefined) return out;
		const reason = `url host ${bad.hostname} is in maliciousDomains`;
		out.note.push(
			{ type: "malicious_url", source: "url", ttlMs: null, reason },
			{ type: "do_not_amplify", source: "url", ttlMs: 30 * DAY_MS, reason },
		);
		return out;
	},
};
