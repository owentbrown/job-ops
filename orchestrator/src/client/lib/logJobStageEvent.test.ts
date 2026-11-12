import type { LogEventFormValues } from "@client/components/LogEventModal";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { logJobStageEvent } from "./logJobStageEvent";

vi.mock("../api", () => ({
  transitionJobStage: vi.fn(),
  updateJobStageEvent: vi.fn(),
}));

const baseValues: LogEventFormValues = {
  stage: "screening",
  title: "Recruiter Screen",
  date: "2026-05-27T10:00",
  notes: "Follow-up scheduled",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.transitionJobStage).mockResolvedValue({
    id: "evt-new",
    applicationId: "job-1",
    title: "Recruiter Screen",
    groupId: null,
    fromStage: "applied",
    toStage: "screening",
    occurredAt: 1_700_000_000,
    metadata: null,
    outcome: null,
  });
});

describe("logJobStageEvent", () => {
  it("transitions to the selected stage with board reason code", async () => {
    const result = await logJobStageEvent({
      jobId: "job-1",
      currentStage: "applied",
      values: baseValues,
      manualStageReasonCode: "in_progress_board_menu",
    });

    expect(api.transitionJobStage).toHaveBeenCalledWith("job-1", {
      toStage: "screening",
      occurredAt: expect.any(Number),
      metadata: expect.objectContaining({
        actor: "user",
        eventType: "status_update",
        eventLabel: "Recruiter Screen",
        note: "Follow-up scheduled",
        reasonCode: "in_progress_board_menu",
      }),
      outcome: null,
    });
    expect(result.effectiveStage).toBe("screening");
    expect(result.newEvent).toEqual(expect.objectContaining({ id: "evt-new" }));
  });

  it("keeps the current stage when no_change is selected", async () => {
    await logJobStageEvent({
      jobId: "job-1",
      currentStage: "screening",
      values: {
        ...baseValues,
        stage: "no_change",
        title: "Update",
      },
    });

    expect(api.transitionJobStage).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        toStage: "screening",
        metadata: expect.objectContaining({
          eventType: "note",
          reasonCode: undefined,
        }),
      }),
    );
  });

  it("maps rejected to closed with outcome", async () => {
    await logJobStageEvent({
      jobId: "job-1",
      currentStage: "interview",
      values: {
        ...baseValues,
        stage: "rejected",
        reasonCode: "Skills",
      },
    });

    expect(api.transitionJobStage).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        toStage: "closed",
        outcome: "rejected",
        metadata: expect.objectContaining({
          reasonCode: "Skills",
        }),
      }),
    );
  });

  it("updates an existing event when eventId is provided", async () => {
    await logJobStageEvent({
      jobId: "job-1",
      currentStage: "applied",
      values: baseValues,
      eventId: "evt-1",
    });

    expect(api.updateJobStageEvent).toHaveBeenCalledWith(
      "job-1",
      "evt-1",
      expect.objectContaining({
        toStage: "screening",
        metadata: expect.objectContaining({
          reasonCode: "job_page_manual_stage",
        }),
      }),
    );
    expect(api.transitionJobStage).not.toHaveBeenCalled();
  });
});
