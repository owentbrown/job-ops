import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const generatePrepKit = vi.fn();
const proposeWrapUp = vi.fn();

vi.mock("@server/services/prep-kit", async () => {
  const actual = await vi.importActual<
    typeof import("@server/services/prep-kit")
  >("@server/services/prep-kit");
  return {
    ...actual,
    generatePrepKit: (...args: unknown[]) => generatePrepKit(...args),
    proposeWrapUp: (...args: unknown[]) => proposeWrapUp(...args),
  };
});

const KIT = {
  sections: [
    {
      id: "s-open",
      title: "Opener",
      cues: ["Adoption is my thing"],
      detail: '"I lead adoption..."',
    },
    {
      id: "s-pay",
      title: "Salary",
      cues: ["Ask for the upper end"],
      detail: "Band $88K-$119K",
    },
  ],
  questions: [
    {
      id: "q-hybrid",
      text: "What's the hybrid rhythm?",
      detail: "",
      answered: false,
      answer: "",
    },
  ],
};

describe.sequential("Prep kit routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
    generatePrepKit.mockReset();
    proposeWrapUp.mockReset();
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function seedJob() {
    const { createJob } = await import("@server/repositories/jobs");
    return createJob({
      source: "linkedin",
      title: "Success Enablement Manager",
      employer: "Jobber",
      jobUrl: "https://example.com/jobs/1",
    });
  }

  const json = (body: unknown) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  it("starts empty, then generates and saves a kit", async () => {
    const job = await seedJob();
    let res = await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit`);
    let body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ kit: null, jots: [] });

    generatePrepKit.mockResolvedValue({ ok: true, data: KIT });
    res = await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit/generate`, {
      method: "POST",
    });
    body = await res.json();
    expect(res.status).toBe(200);
    expect(
      body.data.kit.sections.map((s: { title: string }) => s.title),
    ).toEqual(["Opener", "Salary"]);
    expect(generatePrepKit).toHaveBeenCalledWith(
      expect.objectContaining({ id: job.id }),
      null,
    );

    // A second generate refreshes and passes the existing kit along.
    res = await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit/generate`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(generatePrepKit.mock.calls[1][1]).toMatchObject({
      sections: KIT.sections,
    });
  });

  it("reports an AI failure without saving anything", async () => {
    const job = await seedJob();
    generatePrepKit.mockResolvedValue({ ok: false, error: "No AI API key" });
    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit/generate`, {
      method: "POST",
    });
    expect(res.status).toBe(502);
    const after = await (
      await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit`)
    ).json();
    expect(after.data.kit).toBeNull();
  });

  it("saves edits and drops cards without a title", async () => {
    const job = await seedJob();
    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: [...KIT.sections, { id: "x", title: "  ", cues: [] }],
        questions: KIT.questions,
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.kit.sections).toHaveLength(2);
    expect(body.data.kit.questions[0].id).toBe("q-hybrid");
  });

  it("adds, edits and deletes jots", async () => {
    const job = await seedJob();
    let res = await fetch(
      `${baseUrl}/api/jobs/${job.id}/jots`,
      json({ text: "105 max L3 mid", sectionHint: "Salary" }),
    );
    const created = (await res.json()).data;
    expect(res.status).toBe(201);
    expect(created).toMatchObject({
      text: "105 max L3 mid",
      sectionHint: "Salary",
    });

    await fetch(
      `${baseUrl}/api/jobs/${job.id}/jots`,
      json({ text: "1 day/wk KW" }),
    );

    res = await fetch(`${baseUrl}/api/jobs/${job.id}/jots/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "$105K max, L3 midpoint" }),
    });
    expect((await res.json()).data.text).toBe("$105K max, L3 midpoint");

    res = await fetch(
      `${baseUrl}/api/jobs/${job.id}/jots`,
      json({ text: "  " }),
    );
    expect(res.status).toBe(400);

    res = await fetch(`${baseUrl}/api/jobs/${job.id}/jots/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const after = await (
      await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit`)
    ).json();
    expect(after.data.jots.map((j: { text: string }) => j.text)).toEqual([
      "1 day/wk KW",
    ]);
  });

  it("wrap-up proposes, then apply saves the note, kit and closes jots", async () => {
    const job = await seedJob();
    const jot = (
      await (
        await fetch(
          `${baseUrl}/api/jobs/${job.id}/jots`,
          json({ text: "1 day/wk KW" }),
        )
      ).json()
    ).data;

    proposeWrapUp.mockResolvedValueOnce({ ok: false, error: "AI down" });
    let res = await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit/wrap-up`, {
      method: "POST",
    });
    expect(res.status).toBe(502);

    proposeWrapUp.mockResolvedValue({
      ok: true,
      data: {
        noteTitle: "HR screen – 24 Nov",
        noteContent: "## Logistics\n- 1 day a week at the K-W office",
        kit: KIT,
        changedSections: [],
        answeredQuestionIds: ["q-hybrid"],
        jotIds: [jot.id],
      },
    });
    res = await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit/wrap-up`, {
      method: "POST",
    });
    const proposal = (await res.json()).data;
    expect(res.status).toBe(200);
    expect(proposeWrapUp.mock.calls.at(-1)?.[2]).toHaveLength(1);

    // Nothing is saved by the proposal itself.
    let state = (
      await (await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit`)).json()
    ).data;
    expect(state.jots).toHaveLength(1);

    res = await fetch(
      `${baseUrl}/api/jobs/${job.id}/prep-kit/wrap-up/apply`,
      json({
        noteTitle: proposal.noteTitle,
        noteContent: proposal.noteContent,
        kit: proposal.kit,
        jotIds: proposal.jotIds,
      }),
    );
    const applied = (await res.json()).data;
    expect(res.status).toBe(200);
    expect(applied.note.title).toBe("HR screen – 24 Nov");
    expect(applied.jots).toEqual([]);
    expect(applied.kit.sections).toHaveLength(2);

    const notes = (
      await (await fetch(`${baseUrl}/api/jobs/${job.id}/notes`)).json()
    ).data;
    expect(notes[0].content).toContain("K-W office");

    state = (
      await (await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit`)).json()
    ).data;
    expect(state.jots).toEqual([]);
  });

  it("refuses wrap-up with no jots", async () => {
    const job = await seedJob();
    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/prep-kit/wrap-up`, {
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(proposeWrapUp).not.toHaveBeenCalled();
  });
});
