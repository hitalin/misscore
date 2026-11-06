import { describe, expect, it } from "vitest";
import type { NoteLabel, UserLabel } from "./labels.js";
import { NOW } from "./testing.js";
import type { ReporterProfile, TargetProfile, TriageInput } from "./triage.js";
import { reporterReliability, triage } from "./triage.js";

const low = { score: 10, isHigh: false, basis: "heuristic" as const };
const high = { score: 90, isHigh: true, basis: "pagerank" as const };

function input(
	over: {
		reporter?: Partial<ReporterProfile>;
		target?: Partial<TargetProfile>;
		comment?: string;
		remote?: boolean;
		urgentKeywords?: string[];
	} = {},
): TriageInput {
	return {
		report: {
			id: "r1",
			createdAt: NOW,
			comment: over.comment ?? "spam",
			reporterId: "rep",
			reporterHost: over.remote === true ? "a.test" : null,
			targetUserId: "tgt",
			targetUserHost: over.remote === true ? "b.test" : null,
			resolved: false,
			forwarded: false,
		},
		reporter: {
			credibility: low,
			isSuspended: false,
			priorAccepted: 0,
			priorRejected: 0,
			...over.reporter,
		},
		target: {
			isSuspended: false,
			isSilenced: false,
			credibility: low,
			labels: new Set<UserLabel>(),
			recentNoteLabels: new Set<NoteLabel>(),
			openReports: 1,
			distinctReporters: 1,
			...over.target,
		},
		...(over.urgentKeywords === undefined
			? {}
			: { urgentKeywords: over.urgentKeywords }),
		now: NOW,
	};
}

describe("reporterReliability", () => {
	it("is 0.5 without history and moves with outcomes", () => {
		expect(
			reporterReliability({
				credibility: low,
				isSuspended: false,
				priorAccepted: 0,
				priorRejected: 0,
			}),
		).toBe(0.5);
		expect(
			reporterReliability({
				credibility: low,
				isSuspended: false,
				priorAccepted: 10,
				priorRejected: 0,
			}),
		).toBeGreaterThan(0.9);
		expect(
			reporterReliability({
				credibility: low,
				isSuspended: false,
				priorAccepted: 0,
				priorRejected: 10,
			}),
		).toBeLessThan(0.1);
	});
});

describe("triage", () => {
	it("rejects moot reports on suspended targets", () => {
		expect(triage(input({ target: { isSuspended: true } }))).toEqual({
			priority: 0,
			recommendation: "reject",
			reasons: ["target already suspended"],
		});
	});
	it("rejects reports from suspended reporters", () => {
		expect(
			triage(input({ reporter: { isSuspended: true } })).recommendation,
		).toBe("reject");
	});
	it("defaults to review with neutral signals", () => {
		const r = triage(input());
		expect(r.recommendation).toBe("review");
		expect(r.priority).toBeGreaterThan(0);
	});
	it("accepts when many signals agree", () => {
		const r = triage(
			input({
				reporter: { priorAccepted: 10 },
				target: {
					labels: new Set<UserLabel>(["spam_high_recall"]),
					recentNoteLabels: new Set<NoteLabel>(["spam"]),
					distinctReporters: 4,
				},
			}),
		);
		expect(r.recommendation).toBe("accept");
		expect(r.priority).toBeGreaterThanOrEqual(60);
		expect(r.reasons).toContain("4 distinct reporters");
	});
	it("rejects low-priority reports from unreliable reporters", () => {
		const r = triage(input({ reporter: { priorRejected: 10 }, remote: true }));
		expect(r.recommendation).toBe("reject");
	});
	it("never auto-accepts against high-credibility targets", () => {
		const r = triage(
			input({
				reporter: { priorAccepted: 10 },
				target: {
					credibility: high,
					labels: new Set<UserLabel>(["spam_high_recall"]),
					recentNoteLabels: new Set<NoteLabel>(["spam"]),
					distinctReporters: 8,
				},
			}),
		);
		expect(r.recommendation).toBe("review");
		expect(r.reasons).toContain("target has high credibility");
	});
	it("boosts urgent keywords and reports/fav ratio", () => {
		const base = triage(input()).priority;
		expect(
			triage(input({ comment: "posting csam", urgentKeywords: ["csam"] }))
				.priority,
		).toBeGreaterThan(base);
		expect(
			triage(input({ target: { reportsPerFav: 0.8 } })).priority,
		).toBeGreaterThan(base);
	});
});
