import type { DesignResumeJson } from "@shared/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemDialog, type ItemFieldConfig } from "./ItemDialog";

function makeResumeJson(): DesignResumeJson {
  return {
    basics: {},
    summary: {},
    sections: {},
  } as DesignResumeJson;
}

describe("ItemDialog", () => {
  it("uses tokenized input for tags fields", () => {
    const onSave = vi.fn();
    const fields: ItemFieldConfig[] = [
      {
        key: "keywords",
        label: "Keywords",
        type: "tags",
        placeholder: "Add keywords",
      },
    ];

    render(
      <ItemDialog
        open
        title="Edit item"
        description="Dialog description"
        item={{ id: "item-1", keywords: ["React"] }}
        fields={fields}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    const collapsedTokens = screen.getByTestId(
      "design-resume-item-keywords-collapsed-tokens",
    );
    expect(within(collapsedTokens).getByText("React")).toBeInTheDocument();

    const input = screen.getByLabelText("Keywords");
    fireEvent.change(input, { target: { value: "TypeScript, Next.js" } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: ["React", "TypeScript", "Next.js"],
      }),
    );
  });

  it("trims text input values before saving", () => {
    const onSave = vi.fn();
    const fields: ItemFieldConfig[] = [
      { key: "name", label: "Name", type: "text" },
    ];

    render(
      <ItemDialog
        open
        title="Edit item"
        description="Dialog description"
        item={{ id: "item-2", name: "" }}
        fields={fields}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "  Python  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Python",
      }),
    );
  });

  it("saves the link-in-title toggle inside the website object", () => {
    const onSave = vi.fn();
    const fields: ItemFieldConfig[] = [
      {
        key: "website.inlineLink",
        label: "Show link in title",
        type: "toggle",
      },
    ];

    render(
      <ItemDialog
        open
        title="Edit experience"
        description="Dialog description"
        item={{
          id: "experience-1",
          website: { url: "https://acme.example.com", inlineLink: false },
        }}
        fields={fields}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        website: expect.objectContaining({ inlineLink: true }),
      }),
    );
  });

  it("shows AI assist only for opted-in fields", () => {
    const fields: ItemFieldConfig[] = [
      { key: "name", label: "Name", type: "text", aiAssist: true },
      { key: "website.url", label: "Website", type: "text" },
    ];

    render(
      <ItemDialog
        open
        title="Edit item"
        description="Dialog description"
        item={{ id: "item-3", name: "Project", website: { url: "" } }}
        fields={fields}
        resumeJson={makeResumeJson()}
        aiSection="Projects"
        aiPathPrefix="sections.projects.items.0"
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /open ai assistant for name/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open ai assistant for website/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ItemDialog period field", () => {
  const periodFields: ItemFieldConfig[] = [
    {
      key: "period",
      label: "Period",
      type: "period",
      presentLabel: "I currently work here",
    },
  ];

  function renderPeriodDialog(period: string, onSave = vi.fn()) {
    render(
      <ItemDialog
        open
        title="Edit item"
        description="Dialog description"
        item={{ id: "item-1", period }}
        fields={periodFields}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );
    return onSave;
  }

  it("fills start and end from an existing period", () => {
    renderPeriodDialog("Aug 2022 – Aug 2026");

    expect(screen.getByLabelText("Start month")).toHaveValue("8");
    expect(screen.getByLabelText("Start year")).toHaveValue("2022");
    expect(screen.getByLabelText("End month")).toHaveValue("8");
    expect(screen.getByLabelText("End year")).toHaveValue("2026");
    expect(screen.getByTestId("period-preview")).toHaveTextContent(
      "Shows as: Aug 2022 – Aug 2026",
    );
  });

  it("saves Present when the current toggle is on", () => {
    const onSave = renderPeriodDialog("");

    fireEvent.change(screen.getByLabelText("Start month"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("Start year"), {
      target: { value: "2026" },
    });
    fireEvent.click(
      screen.getByRole("switch", { name: "I currently work here" }),
    );

    expect(screen.queryByLabelText("End year")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ period: "Aug 2026 – Present" }),
    );
  });

  it("normalizes free-typed periods it can read", () => {
    renderPeriodDialog("Aug 2026 to Present");

    expect(
      screen.getByRole("switch", { name: "I currently work here" }),
    ).toBeChecked();
    expect(screen.getByTestId("period-preview")).toHaveTextContent(
      "Shows as: Aug 2026 – Present",
    );
  });

  it("keeps unreadable periods as editable text", () => {
    const onSave = renderPeriodDialog("Summer 2019");

    const input = screen.getByLabelText("Period");
    expect(input).toHaveValue("Summer 2019");
    fireEvent.change(input, { target: { value: "Summer 2020 " } });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ period: "Summer 2020" }),
    );
  });

  it("warns when the end date is before the start date", () => {
    renderPeriodDialog("Aug 2026 – Jan 2020");

    expect(screen.getByTestId("period-preview")).toHaveTextContent(
      "End date is before the start date.",
    );
  });
});
