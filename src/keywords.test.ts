import { describe, expect, it } from "vitest";
import {
	extractUrls,
	hostMatches,
	isKeyWordIncluded,
	matchWordMute,
	noteContentForKeywordCheck,
} from "./keywords.js";
import { makeNote } from "./testing.js";

describe("isKeyWordIncluded", () => {
	it("matches all space-separated words (AND)", () => {
		expect(isKeyWordIncluded("buy cheap pills now", ["cheap pills"])).toBe(
			true,
		);
		expect(isKeyWordIncluded("buy cheap now", ["cheap pills"])).toBe(false);
	});
	it("matches regex form", () => {
		expect(isKeyWordIncluded("FREE money", ["/free/i"])).toBe(true);
		expect(isKeyWordIncluded("FREE money", ["/free/"])).toBe(false);
	});
	it("ignores invalid regex and empty inputs", () => {
		expect(isKeyWordIncluded("abc", ["/(/"])).toBe(false);
		expect(isKeyWordIncluded("", ["abc"])).toBe(false);
		expect(isKeyWordIncluded("abc", [])).toBe(false);
	});
});

describe("matchWordMute", () => {
	it("returns matching filters", () => {
		const filters = [["foo", "bar"], ["baz"], "/qu+x/"];
		expect(matchWordMute("foo and bar", filters)).toEqual([["foo", "bar"]]);
		expect(matchWordMute("quuux", filters)).toEqual(["/qu+x/"]);
		expect(matchWordMute("nothing", filters)).toEqual([]);
	});
	it("ignores empty array filters", () => {
		expect(matchWordMute("anything", [[]])).toEqual([]);
	});
});

describe("noteContentForKeywordCheck", () => {
	it("concatenates cw, text and poll choices", () => {
		const note = makeNote({ cw: "c", text: "t", pollChoices: ["a", "b"] });
		expect(noteContentForKeywordCheck(note)).toBe("c\nt\na\nb");
	});
});

describe("extractUrls", () => {
	it("extracts hostnames", () => {
		const urls = extractUrls(
			"see https://evil.example.com/x?y=1 and http://ok.test",
		);
		expect(urls.map((u) => u.hostname)).toEqual([
			"evil.example.com",
			"ok.test",
		]);
	});
	it("returns empty for null", () => {
		expect(extractUrls(null)).toEqual([]);
	});
});

describe("hostMatches", () => {
	it("matches suffix including subdomains", () => {
		expect(hostMatches("a.spam.example", ["spam.example"])).toBe(true);
		expect(hostMatches("spam.example", ["spam.example"])).toBe(true);
		expect(hostMatches("notspam.example", ["spam.example"])).toBe(false);
	});
});
