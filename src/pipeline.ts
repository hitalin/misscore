import type { LabeledNote, PostToUserRule } from "./aggregate.js";
import {
	aggregatePostLabels,
	DEFAULT_POST_TO_USER_RULES,
} from "./aggregate.js";
import type { Credibility } from "./credibility.js";
import type { Decision, EnforcementRule } from "./enforcement.js";
import { DEFAULT_ENFORCEMENT_RULES, decide } from "./enforcement.js";
import type { LabelContext, Labeler } from "./labelers/index.js";
import { DEFAULT_LABELERS, runLabelers } from "./labelers/index.js";
import type { Label, NoteLabel, UserLabel } from "./labels.js";
import { activeTypes, materialize } from "./labels.js";

export interface JudgeInput extends Omit<LabelContext, "history"> {
	/** 作者の直近ノートと、既に付いているノートラベル (新しい順) */
	history: readonly LabeledNote[];
	/** 作者の既存ユーザーラベル */
	userLabels: readonly Label<UserLabel>[];
	credibility: Credibility;
	reports?: { open: number; distinctReporters: number };
	labelers?: readonly Labeler[];
	postToUserRules?: readonly PostToUserRule[];
	enforcementRules?: readonly EnforcementRule[];
}

export interface JudgeResult {
	/** このノートに新しく付いたラベル */
	noteLabels: Label<NoteLabel>[];
	/** 集約で作者に新しく付いたラベル */
	userLabels: Label<UserLabel>[];
	/** 処置の決定 (既存 + 新規ラベルを見て判断) */
	decision: Decision;
}

/**
 * 1 ノートに対する一連の判定: ラベル付与 → ユーザーラベル集約 → 処置決定。
 * 副作用は無い。ラベルの保存と処置の実行は呼び出し側が行う。
 */
export function judgeNote(input: JudgeInput): JudgeResult {
	const { note, author, now, config, history, userLabels, credibility } = input;
	const ctx: LabelContext = {
		note,
		author,
		now,
		config,
		history: history.map((h) => h.note),
		...(input.authorFollowing === undefined
			? {}
			: { authorFollowing: input.authorFollowing }),
	};
	const emitted = runLabelers(ctx, input.labelers ?? DEFAULT_LABELERS);
	const noteLabels = emitted.note.map((e) => materialize(e, now));
	const newUserLabels = emitted.user.map((e) => materialize(e, now));

	const recentNotes: LabeledNote[] = [{ note, labels: noteLabels }, ...history];
	const rules = input.postToUserRules ?? DEFAULT_POST_TO_USER_RULES;
	const known = new Set<UserLabel>([
		...activeTypes(userLabels, now),
		...newUserLabels.map((l) => l.type),
	]);
	for (const label of noteLabels) {
		const out = aggregatePostLabels(rules, {
			event: { label: label.type, note },
			recentNotes,
			user: {
				labels: [...userLabels, ...newUserLabels],
				highCredibility: credibility.isHigh,
			},
			now,
		});
		for (const o of out) {
			if (known.has(o.label)) continue;
			known.add(o.label);
			newUserLabels.push(
				materialize(
					{ type: o.label, source: `aggregate:${o.ruleId}`, ttlMs: o.ttlMs },
					now,
				),
			);
		}
	}

	const decision = decide(input.enforcementRules ?? DEFAULT_ENFORCEMENT_RULES, {
		user: author,
		userLabels: known,
		note: {
			id: note.id,
			labels: activeTypes(noteLabels, now),
			fileIds: note.files.map((f) => f.id),
		},
		credibility,
		...(input.reports === undefined ? {} : { reports: input.reports }),
		now,
	});
	return { noteLabels, userLabels: newUserLabels, decision };
}
