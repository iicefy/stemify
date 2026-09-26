import { describe, expect, it } from "vitest";
import { parseYoutubeUrl } from "./youtubeUrl.js";

describe("parseYoutubeUrl", () => {
  it("accepts https links on YouTube hosts", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=abc",
      "https://youtu.be/abc",
      "https://music.youtube.com/watch?v=abc",
      "  https://m.youtube.com/watch?v=abc  ",
    ]) {
      expect(parseYoutubeUrl(link)?.href).toBe(link.trim());
    }
  });

  it("rejects other hosts, http, look-alikes and non-strings", () => {
    for (const input of [
      "http://www.youtube.com/watch?v=abc",
      "https://youtube.com.evil.example/watch",
      "https://example.com/?u=youtube.com",
      "file:///etc/passwd",
      "not a url",
      "",
      null,
      42,
    ]) {
      expect(parseYoutubeUrl(input)).toBeNull();
    }
  });
});
