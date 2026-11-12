import { describe, expect, it } from "vitest";
import {
  messageTypeFromStageTarget,
  normalizeStageTarget,
  resolveStageTransitionForTarget,
  stageTargetFromMessageType,
} from "./stage-target";

describe("normalizeStageTarget", () => {
  it("accepts current targets", () => {
    expect(normalizeStageTarget("screening")).toBe("screening");
    expect(normalizeStageTarget("rejected")).toBe("rejected");
  });

  it.each([
    ["recruiter_screen", "screening"],
    ["assessment", "screening"],
    ["hiring_manager_screen", "interview"],
    ["technical_interview", "interview"],
    ["onsite", "interview"],
  ])("converts legacy %s to %s", (legacy, expected) => {
    expect(normalizeStageTarget(legacy)).toBe(expected);
  });

  it("rejects unknown values", () => {
    expect(normalizeStageTarget("phone_call")).toBeNull();
    expect(normalizeStageTarget(42)).toBeNull();
  });
});

describe("stageTargetFromMessageType", () => {
  it.each([
    ["update", "screening"],
    ["interview", "interview"],
    ["offer", "offer"],
    ["rejection", "rejected"],
    ["other", "no_change"],
  ] as const)("%s -> %s", (type, target) => {
    expect(stageTargetFromMessageType(type)).toBe(target);
  });
});

describe("messageTypeFromStageTarget", () => {
  it.each([
    ["applied", "update"],
    ["screening", "update"],
    ["interview", "interview"],
    ["offer", "offer"],
    ["rejected", "rejection"],
    ["withdrawn", "rejection"],
    ["closed", "rejection"],
    ["no_change", "other"],
  ] as const)("%s -> %s", (target, type) => {
    expect(messageTypeFromStageTarget(target)).toBe(type);
  });
});

describe("resolveStageTransitionForTarget", () => {
  it("closes rejected applications with the rejected outcome", () => {
    expect(resolveStageTransitionForTarget("rejected")).toEqual({
      toStage: "closed",
      outcome: "rejected",
      reasonCode: "rejected",
    });
  });

  it("passes plain stages through", () => {
    expect(resolveStageTransitionForTarget("interview")).toEqual({
      toStage: "interview",
      outcome: null,
      reasonCode: null,
    });
  });
});

describe("normalizeStageTarget prototype safety", () => {
  it.each(["toString", "constructor", "__proto__"])("rejects %s", (value) => {
    expect(normalizeStageTarget(value)).toBeNull();
  });
});
