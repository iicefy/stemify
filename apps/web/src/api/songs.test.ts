import { describe, expect, it } from "vitest";
import { sortStems } from "./songs";

describe("sortStems", () => {
  it("moves 'other' last and keeps everything else in order", () => {
    const names = ["drums", "bass", "other", "vocals", "guitar", "piano"].map((name) => ({ id: name, name }));
    expect(sortStems(names).map((s) => s.name)).toEqual(["drums", "bass", "vocals", "guitar", "piano", "other"]);
  });

  it("doesn't mutate its input", () => {
    const stems = [{ id: "1", name: "other" }, { id: "2", name: "bass" }];
    sortStems(stems);
    expect(stems[0].name).toBe("other");
  });
});
