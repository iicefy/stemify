import { describe, expect, it } from "vitest";
import { parseRoute, routeToHash } from "./router";

describe("parseRoute", () => {
  it("reads song routes", () => {
    expect(parseRoute("#/song/abc-123")).toEqual({ page: "song", songId: "abc-123" });
    expect(parseRoute("#/song/abc-123/")).toEqual({ page: "song", songId: "abc-123" });
  });

  it("falls back to the library for anything else", () => {
    for (const hash of ["", "#", "#/", "#/song/", "#/song/a/b", "#/nope", "#/song/%E0%A4%A"]) {
      expect(parseRoute(hash)).toEqual({ page: "library" });
    }
  });

  it("round-trips ids that need escaping", () => {
    const route = { page: "song" as const, songId: "a b/c" };
    expect(parseRoute(routeToHash(route))).toEqual(route);
  });
});
