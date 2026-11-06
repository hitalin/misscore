import { extractUrls } from "../keywords.js";
import { DAY_MS } from "../labels.js";
import { isNewAccount } from "./shared.js";
import type { Labeler, LabelerOutput } from "./types.js";

/**
 * メンションスパム判定。
 * - mentionLimit 超過 → mention_spam
 * - 返信でもリノートでもなく、URL を含み、フォローしていない相手への
 *   メンションがある新規アカウント → spam_high_recall
 *   (botmaker 5239/6754 の「LOW_QUALITY URL + 非フォロー相手への @mention」相当)
 */
export const mentionLabeler: Labeler = {
	id: "mention",
	run({ note, author, config, now, authorFollowing }) {
		const out: LabelerOutput = { note: [], user: [] };
		if (note.mentions.length > config.mentionLimit) {
			out.note.push({
				type: "mention_spam",
				source: "mention",
				ttlMs: null,
				reason: `mentions ${note.mentions.length} > mentionLimit ${config.mentionLimit}`,
			});
		}
		const unsolicited =
			authorFollowing === undefined
				? note.mentions.length
				: note.mentions.filter((id) => !authorFollowing.has(id)).length;
		const isTopLevel = note.replyId === null && note.renoteId === null;
		const hasUrl = extractUrls(note.text).length > 0;
		if (
			isTopLevel &&
			hasUrl &&
			unsolicited > 0 &&
			isNewAccount(author, now, config)
		) {
			out.note.push({
				type: "spam_high_recall",
				source: "mention",
				ttlMs: 7 * DAY_MS,
				reason: "new account mentions non-followed users with a URL",
			});
		}
		return out;
	},
};
