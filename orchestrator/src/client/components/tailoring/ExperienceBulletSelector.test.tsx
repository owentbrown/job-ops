import type { ExperienceBulletCatalogItem } from "@shared/resume-experience-bullets";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  countKeptExperienceBullets,
  ExperienceBulletSelector,
} from "./ExperienceBulletSelector";

const catalog: ExperienceBulletCatalogItem[] = [
  {
    id: "exp-1",
    company: "Acme",
    position: "Lead",
    period: "2022 - Present",
    bullets: ["Shipped v2", "Hired team", "Cut costs"],
  },
  {
    id: "exp-2",
    company: "Globex",
    position: "Analyst",
    period: "2015 - 2017",
    bullets: ["Old work"],
  },
];

describe("ExperienceBulletSelector", () => {
  it("shows every bullet as kept when the job has no selection", () => {
    render(
      <ExperienceBulletSelector
        catalog={catalog}
        selection={null}
        onToggleBullet={vi.fn()}
        onKeepAll={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toHaveAttribute("data-state", "checked");
    }
    expect(screen.getByText("3/3 kept")).toBeInTheDocument();
    expect(screen.queryByText("Keep all")).not.toBeInTheDocument();
  });

  it("reflects a stored selection and reports toggles and resets per role", () => {
    const onToggleBullet = vi.fn();
    const onKeepAll = vi.fn();
    render(
      <ExperienceBulletSelector
        catalog={catalog}
        selection={{ "exp-1": [0, 2], "exp-2": [] }}
        onToggleBullet={onToggleBullet}
        onKeepAll={onKeepAll}
        disabled={false}
      />,
    );

    expect(screen.getByText("2/3 kept")).toBeInTheDocument();
    expect(screen.getByText("0/1 kept")).toBeInTheDocument();
    expect(screen.getByLabelText("Hired team")).toHaveAttribute(
      "data-state",
      "unchecked",
    );

    fireEvent.click(screen.getByLabelText("Hired team"));
    expect(onToggleBullet).toHaveBeenCalledWith("exp-1", 1, 3);

    fireEvent.click(screen.getByLabelText("Keep all bullets for Lead · Acme"));
    expect(onKeepAll).toHaveBeenCalledWith("exp-1");
  });

  it("counts kept bullets across roles", () => {
    expect(countKeptExperienceBullets(catalog, null)).toEqual({
      kept: 4,
      total: 4,
    });
    expect(countKeptExperienceBullets(catalog, { "exp-2": [] })).toEqual({
      kept: 3,
      total: 4,
    });
  });
});
