import { describe, expect, it } from "vitest";
import type { LabeledNote } from "./aggregate.js";
import {
	aggregatePostLabels,
	DEFAULT_POST_TO_USER_RULES,
} from "./aggregate.js";
import type { NoteLabel } from "./labels.js";
import { DAY_MS, materialize } from "./labels.js";
import { makeNote, NOW } from "./testing.js";

function labeled(
	id: string,
	labels: NoteLabel[],
	daysAgo = 0,
	files = 1,
): LabeledNote {
	const note = makeNote({
		id,
		createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
		files: Array.from({ length: files }, (_, i) => ({
			id: `${id}f${i}`,
			type: "image/png",
			isSensitive: false,
		})),
	});
	return {
		note,
		labels: labels.map((type) =>
			materialize({ type, source: "t", ttlMs: null }, NOW),
		),
	};
}

describe("aggregatePostLabels (nsfw rule)", () => {
	const run = (
		recent: LabeledNote[],
		highCred = false,
		userLabels: string[] = [],
	) =>
		aggregatePostLabels(DEFAULT_POST_TO_USER_RULES, {
			event: {
				label: "nsfw_high_precision",
				note: recent[0]?.note ?? makeNote(),
			},
			recentNotes: recent,
			user: {
				labels: userLabels.map((type) =>
					materialize(
						{ type: type as "nsfw_high_precision", source: "t", ttlMs: null },
						NOW,
					),
				),
				highCredibility: highCred,
			},
			now: NOW,
		});

	it("applies user label when 3 of last 5 media notes are nsfw", () => {
		const recent = [
			labeled("1", ["nsfw_high_precision"]),
			labeled("2", []),
			labeled("3", ["nsfw_high_precision"]),
			labeled("4", ["nsfw_high_precision"]),
			labeled("5", []),
		];
		expect(run(recent)).toEqual([
			{
				ruleId: "nsfw_high_precision",
				label: "nsfw_high_precision",
				ttlMs: 7 * DAY_MS,
			},
		]);
	});
	it("does not fire below threshold", () => {
		const recent = [
			labeled("1", ["nsfw_high_precision"]),
			labeled("2", ["nsfw_high_precision"]),
		];
		expect(run(recent)).toEqual([]);
	});
	it("only counts media notes and respects window", () => {
		const recent = [
			labeled("1", ["nsfw_high_precision"]),
			labeled("t1", [], 0, 0),
			labeled("t2", [], 0, 0),
			labeled("2", ["nsfw_high_precision"]),
			labeled("3", ["nsfw_high_precision"]),
		];
		expect(run(recent)).toHaveLength(1);
	});
	it("ignores posts older than maxPostAgeDays", () => {
		const recent = [
			labeled("1", ["nsfw_high_precision"]),
			labeled("2", ["nsfw_high_precision"], 61),
			labeled("3", ["nsfw_high_precision"], 61),
		];
		expect(run(recent)).toEqual([]);
	});
	it("excludes users that already have the label", () => {
		const recent = [
			labeled("1", ["nsfw_high_precision"]),
			labeled("2", ["nsfw_high_precision"]),
			labeled("3", ["nsfw_high_precision"]),
		];
		expect(run(recent, false, ["nsfw_high_precision"])).toEqual([]);
	});
});

describe("aggregatePostLabels (spam rule)", () => {
	it("fires on a single high-precision spam note", () => {
		const recent = [labeled("1", ["spam", "spam_high_recall"], 0, 0)];
		const out = aggregatePostLabels(DEFAULT_POST_TO_USER_RULES, {
			event: { label: "spam_high_recall", note: recent[0]?.note ?? makeNote() },
			recentNotes: recent,
			user: { labels: [], highCredibility: false },
			now: NOW,
		});
		expect(out.map((o) => o.label)).toEqual(["spam_high_recall"]);
	});
	it("skips high-credibility users", () => {
		const recent = [labeled("1", ["spam"], 0, 0)];
		const out = aggregatePostLabels(DEFAULT_POST_TO_USER_RULES, {
			event: { label: "spam_high_recall", note: recent[0]?.note ?? makeNote() },
			recentNotes: recent,
			user: { labels: [], highCredibility: true },
			now: NOW,
		});
		expect(out).toEqual([]);
	});
});
