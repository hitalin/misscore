import { describe, expect, it } from "vitest";
import { DAY_MS } from "../labels.js";
import { NOW } from "../testing.js";
import {
	fromApiNote,
	fromApiReport,
	fromApiUser,
	toApiCalls,
} from "./adapter.js";

describe("fromApiNote", () => {
	it("fills defaults and converts poll", () => {
		const n = fromApiNote({
			id: "n",
			createdAt: "2026-09-23T00:00:00Z",
			userId: "u",
			user: { host: "x.test" },
			text: "t",
			visibility: "public",
			reactions: {},
			renoteCount: 0,
			repliesCount: 0,
			poll: { choices: [{ text: "a" }, { text: "b" }] },
			files: [
				{ id: "f", type: "image/png", isSensitive: true, maybePorn: true },
			],
		});
		expect(n.userHost).toBe("x.test");
		expect(n.cw).toBeNull();
		expect(n.pollChoices).toEqual(["a", "b"]);
		expect(n.files[0]).toEqual({
			id: "f",
			type: "image/png",
			isSensitive: true,
			maybePorn: true,
		});
		expect(n.createdAt.getTime()).toBe(NOW.getTime());
	});
});

describe("fromApiUser / fromApiReport", () => {
	it("maps user fields", () => {
		const u = fromApiUser({
			id: "u",
			createdAt: "2026-09-23T00:00:00Z",
			host: null,
			username: "u",
			name: null,
			description: null,
			followersCount: 1,
			followingCount: 2,
			notesCount: 3,
			isSilenced: true,
			roles: [{ id: "r" }],
		});
		expect(u.isSilenced).toBe(true);
		expect(u.isSuspended).toBe(false);
		expect(u.roleIds).toEqual(["r"]);
		expect(u.lastActiveDate).toBeNull();
	});
	it("maps report hosts", () => {
		const r = fromApiReport({
			id: "r",
			createdAt: "2026-09-23T00:00:00Z",
			comment: "c",
			resolved: false,
			reporterId: "a",
			targetUserId: "b",
			forwarded: false,
			reporter: { host: null },
			targetUser: { host: "remote.test" },
		});
		expect(r.reporterHost).toBeNull();
		expect(r.targetUserHost).toBe("remote.test");
	});
});

describe("toApiCalls", () => {
	it("maps actions to admin endpoints", () => {
		const calls = toApiCalls(
			"u",
			[
				{ kind: "suspend" },
				{ kind: "silence", ttlMs: DAY_MS },
				{ kind: "deleteNote", noteId: "n" },
				{ kind: "markSensitive", fileIds: ["f1", "f2"] },
				{ kind: "requireReview", reason: "why" },
				{ kind: "labelUser", label: "spam_high_recall", ttlMs: null },
			],
			NOW,
			{ silenceRoleId: "role" },
		);
		expect(calls.map((c) => c.endpoint)).toEqual([
			"admin/suspend-user",
			"admin/roles/assign",
			"notes/delete",
			"drive/files/update",
			"drive/files/update",
			"admin/update-user-note",
			"admin/update-user-note",
		]);
		expect(calls[1]?.params).toEqual({
			roleId: "role",
			userId: "u",
			expiresAt: NOW.getTime() + DAY_MS,
		});
	});
	it("falls back to a moderation note when no silence role is configured", () => {
		const calls = toApiCalls("u", [{ kind: "silence", ttlMs: null }], NOW);
		expect(calls[0]?.endpoint).toBe("admin/update-user-note");
	});
	it("can skip label recording", () => {
		expect(
			toApiCalls(
				"u",
				[{ kind: "labelUser", label: "spam_high_recall", ttlMs: null }],
				NOW,
				{ recordLabelsInModerationNote: false },
			),
		).toEqual([]);
	});
});
