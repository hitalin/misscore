import type { Label, NoteLabel, UserLabel } from "./labels.js";
import { activeTypes, DAY_MS } from "./labels.js";
import type { NoteInput } from "./types.js";

/** safety-label-user-agg の PostLabelCountCondition */
export interface PostLabelCountCondition {
	/** 直近何件のノートを見るか */
	windowSize: number;
	/** そのうち何件が一致すれば真か */
	minimumMatchingPosts: number;
	maxPostAgeDays: number;
	/** メディア付きノートだけを数えるか */
	mediaOnly?: boolean;
	postLabels: { anyOf?: NoteLabel[]; allOf?: NoteLabel[] };
}

export interface PostToUserRule {
	id: string;
	enabled?: boolean;
	/** このラベルが付いたイベントで評価を始める */
	triggerPostLabels: NoteLabel[];
	maxTriggerPostAgeDays: number;
	/** DNF: anyOf のどれかのグループで allOf がすべて真 */
	condition: { anyOf: { allOf: PostLabelCountCondition[] }[] };
	applyUserLabel: UserLabel;
	userLabelTtlDays: number;
	exclusions?: {
		/** 高信頼ユーザーを除外 */
		highCredibility?: boolean;
		/** すでにこれらのラベルを持つユーザーを除外 */
		userLabels?: UserLabel[];
	};
}

export interface LabeledNote {
	note: NoteInput;
	labels: readonly Label<NoteLabel>[];
}

export interface AggregateInput {
	/** 発火したイベント */
	event: { label: NoteLabel; note: NoteInput };
	/** 作者の直近ノート (新しい順)。イベントのノートを含めてよい */
	recentNotes: readonly LabeledNote[];
	user: {
		labels: readonly Label<UserLabel>[];
		highCredibility: boolean;
	};
	now: Date;
}

export interface AggregateOutput {
	ruleId: string;
	label: UserLabel;
	ttlMs: number;
}

function ageDays(note: NoteInput, now: Date): number {
	return (now.getTime() - note.createdAt.getTime()) / DAY_MS;
}

function conditionHolds(
	c: PostLabelCountCondition,
	recent: readonly LabeledNote[],
	now: Date,
): boolean {
	const pool =
		c.mediaOnly === true
			? recent.filter((r) => r.note.files.length > 0)
			: recent;
	const window = pool.slice(0, c.windowSize);
	const anyOf = c.postLabels.anyOf ?? [];
	const allOf = c.postLabels.allOf ?? [];
	let count = 0;
	for (const { note, labels } of window) {
		if (ageDays(note, now) > c.maxPostAgeDays) continue;
		const types = activeTypes(labels, now);
		const anyOk = anyOf.length === 0 || anyOf.some((l) => types.has(l));
		const allOk = allOf.every((l) => types.has(l));
		if (anyOk && allOk) count++;
	}
	return count >= c.minimumMatchingPosts;
}

/**
 * ノートラベルのイベントから、ユーザーラベルを導く。
 * 同じラベルを複数ルールが出した場合は TTL の最大値を採用する。
 */
export function aggregatePostLabels(
	rules: readonly PostToUserRule[],
	input: AggregateInput,
): AggregateOutput[] {
	const { event, recentNotes, user, now } = input;
	const userTypes = activeTypes(user.labels, now);
	const byLabel = new Map<UserLabel, AggregateOutput>();
	for (const rule of rules) {
		if (rule.enabled === false) continue;
		if (!rule.triggerPostLabels.includes(event.label)) continue;
		if (ageDays(event.note, now) > rule.maxTriggerPostAgeDays) continue;
		if (rule.exclusions?.highCredibility === true && user.highCredibility)
			continue;
		if (rule.exclusions?.userLabels?.some((l) => userTypes.has(l)) === true)
			continue;
		const matched = rule.condition.anyOf.some((group) =>
			group.allOf.every((c) => conditionHolds(c, recentNotes, now)),
		);
		if (!matched) continue;
		const ttlMs = rule.userLabelTtlDays * DAY_MS;
		const prev = byLabel.get(rule.applyUserLabel);
		if (prev === undefined || prev.ttlMs < ttlMs) {
			byLabel.set(rule.applyUserLabel, {
				ruleId: rule.id,
				label: rule.applyUserLabel,
				ttlMs,
			});
		}
	}
	return [...byLabel.values()];
}

/** x-algorithm の既定ルールを Misskey 向けに写したもの */
export const DEFAULT_POST_TO_USER_RULES: readonly PostToUserRule[] = [
	{
		id: "nsfw_high_precision",
		triggerPostLabels: ["nsfw_high_precision"],
		maxTriggerPostAgeDays: 60,
		condition: {
			anyOf: [
				{
					allOf: [
						{
							windowSize: 5,
							minimumMatchingPosts: 3,
							maxPostAgeDays: 60,
							mediaOnly: true,
							postLabels: { anyOf: ["nsfw_high_precision"] },
						},
					],
				},
			],
		},
		applyUserLabel: "nsfw_high_precision",
		userLabelTtlDays: 7,
		exclusions: { userLabels: ["nsfw_high_precision"] },
	},
	{
		id: "spam_high_recall",
		triggerPostLabels: [
			"spam_high_recall",
			"copypasta_spam",
			"mention_spam",
			"malicious_url",
		],
		maxTriggerPostAgeDays: 7,
		condition: {
			anyOf: [
				{
					allOf: [
						{
							windowSize: 10,
							minimumMatchingPosts: 3,
							maxPostAgeDays: 7,
							postLabels: {
								anyOf: [
									"spam_high_recall",
									"copypasta_spam",
									"mention_spam",
									"malicious_url",
								],
							},
						},
					],
				},
				{
					allOf: [
						{
							windowSize: 10,
							minimumMatchingPosts: 1,
							maxPostAgeDays: 7,
							postLabels: { anyOf: ["spam"] },
						},
					],
				},
			],
		},
		applyUserLabel: "spam_high_recall",
		userLabelTtlDays: 7,
		exclusions: { highCredibility: true, userLabels: ["spam_high_recall"] },
	},
];
