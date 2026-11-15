import { describe, expect, it } from "vitest";
import { updateJobSchema } from "./shared";

describe("updateJobSchema selectedExperienceBullets", () => {
  it("canonicalizes a valid selection", () => {
    const parsed = updateJobSchema.parse({
      selectedExperienceBullets: '{"b":[2,0],"a":[1]}',
    });
    expect(parsed.selectedExperienceBullets).toBe('{"a":[1],"b":[0,2]}');
  });

  it("clears the selection for an empty string or null", () => {
    expect(
      updateJobSchema.parse({ selectedExperienceBullets: "" })
        .selectedExperienceBullets,
    ).toBeNull();
    expect(
      updateJobSchema.parse({ selectedExperienceBullets: null })
        .selectedExperienceBullets,
    ).toBeNull();
  });

  it("leaves the field out when it is not sent", () => {
    expect(updateJobSchema.parse({})).not.toHaveProperty(
      "selectedExperienceBullets",
    );
  });

  it("rejects malformed selections", () => {
    for (const value of ["{bad", "[1,2]", '{"a":["x"]}', '{"a":[-1]}']) {
      expect(
        updateJobSchema.safeParse({ selectedExperienceBullets: value }).success,
      ).toBe(false);
    }
  });
});
