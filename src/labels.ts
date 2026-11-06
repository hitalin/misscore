/**
 * ラベル語彙。x-algorithm の SafetyLabelType / Gizmoduck LabelValue を
 * Misskey で観測できる信号に絞って写したもの。
 */
export const NOTE_LABELS = [
	/** 高精度スパム。全閲覧者に非表示 */
	"spam",
	/** 高再現率スパム。おすすめ・非フォロワー向けにのみ非表示 */
	"spam_high_recall",
	"nsfw_high_precision",
	"nsfw_high_recall",
	"gore_and_violence",
	/** meta.prohibitedWords に一致 */
	"prohibited_word",
	/** meta.sensitiveWords に一致 (public -> home 相当) */
	"sensitive_word",
	"malicious_url",
	"do_not_amplify",
	"mention_spam",
	"copypasta_spam",
	/** 作者本人にも非表示にする緊急ラベル */
	"for_emergency_use_only",
	"legal_takedown",
] as const;
export type NoteLabel = (typeof NOTE_LABELS)[number];

export const USER_LABELS = [
	"spam_high_recall",
	"nsfw_high_precision",
	"nsfw_high_recall",
	"nsfw_avatar_image",
	"nsfw_banner_image",
	"abusive_high_recall",
	"compromised",
	"impersonation",
	"do_not_amplify",
	"read_only",
	/** モデレーターが手動で除外指定 (自動処置の対象外) */
	"allowlisted",
] as const;
export type UserLabel = (typeof USER_LABELS)[number];

export interface Label<T extends string> {
	type: T;
	/** 付与元 (labeler id / rule id / 'manual') */
	source: string;
	createdAt: Date;
	/** null なら無期限 */
	expiresAt: Date | null;
	/** モデルの確信度など。VF は存在だけを見る */
	score?: number;
}

export interface LabelEmission<T extends string> {
	type: T;
	source: string;
	ttlMs: number | null;
	score?: number;
}

export function materialize<T extends string>(
	emission: LabelEmission<T>,
	now: Date,
): Label<T> {
	const label: Label<T> = {
		type: emission.type,
		source: emission.source,
		createdAt: now,
		expiresAt:
			emission.ttlMs === null ? null : new Date(now.getTime() + emission.ttlMs),
	};
	if (emission.score !== undefined) label.score = emission.score;
	return label;
}

export function isActive<T extends string>(
	label: Label<T>,
	now: Date,
): boolean {
	return label.expiresAt === null || label.expiresAt.getTime() > now.getTime();
}

/** 期限切れを除いた有効なラベルの型集合 */
export function activeTypes<T extends string>(
	labels: readonly Label<T>[],
	now: Date,
): Set<T> {
	const set = new Set<T>();
	for (const label of labels) if (isActive(label, now)) set.add(label.type);
	return set;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
