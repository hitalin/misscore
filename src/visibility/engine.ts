import type {
	Audience,
	Policy,
	RuleClause,
	Verdict,
	VisibilityContext,
} from "./types.js";

function admits(audience: Audience, ctx: VisibilityContext): boolean {
	const { relationship, viewer } = ctx;
	switch (audience) {
		case "everyone":
			return true;
		case "exceptAuthor":
			return !relationship.viewerIsAuthor;
		case "exceptAuthorAndFollowers":
			return (
				!relationship.viewerIsAuthor &&
				(viewer.id === null || !relationship.viewerFollowsAuthor)
			);
	}
}

export function ruleApplies(rule: RuleClause, ctx: VisibilityContext): boolean {
	return admits(rule.appliesTo, ctx) && rule.when.every((p) => p(ctx));
}

/**
 * x-algorithm の Policy::evaluate と同じ。
 * 最初に一致した drop で終了し、interstitial は最初の 1 件だけ保持する。
 * 後から drop が一致すれば interstitial は捨てられる。
 */
export function evaluate(policy: Policy, ctx: VisibilityContext): Verdict {
	let interstitial: Verdict | undefined;
	for (const rule of policy.rules) {
		if (!ruleApplies(rule, ctx)) continue;
		if (rule.action.kind === "drop") {
			return { action: "drop", reason: rule.action.reason, rule: rule.name };
		}
		interstitial ??= {
			action: "interstitial",
			reason: rule.action.reason,
			rule: rule.name,
		};
	}
	return interstitial ?? { action: "allow" };
}

/**
 * ポリシーの不変条件を検査する。
 * - drop ルールは interstitial ルールより前に並べる
 * - ルール名は一意
 */
export function validatePolicy(policy: Policy): string[] {
	const errors: string[] = [];
	const seen = new Set<string>();
	let sawRestriction = false;
	for (const rule of policy.rules) {
		if (seen.has(rule.name)) errors.push(`duplicate rule name: ${rule.name}`);
		seen.add(rule.name);
		if (rule.action.kind === "drop") {
			if (sawRestriction) {
				errors.push(`terminal rule after restriction: ${rule.name}`);
			}
		} else {
			sawRestriction = true;
		}
	}
	return errors;
}
