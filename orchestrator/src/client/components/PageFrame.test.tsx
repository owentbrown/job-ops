import { render, screen } from "@testing-library/react";
import { Eye } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { EmbeddedPage, PageFrame } from "./PageFrame";

vi.mock("./layout", () => ({
  PageHeader: ({ title }: { title: string }) => (
    <header>app-header:{title}</header>
  ),
  PageMain: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <main className={className}>{children}</main>,
}));

describe("PageFrame", () => {
  it("renders the app page header and main when standalone", () => {
    render(
      <PageFrame
        icon={Eye}
        title="Watchlist"
        subtitle="Career pages"
        mainClassName="space-y-4"
      >
        <p>body</p>
      </PageFrame>,
    );
    expect(screen.getByText("app-header:Watchlist")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("space-y-4");
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders a section heading and no main when embedded", () => {
    render(
      <EmbeddedPage>
        <PageFrame
          icon={Eye}
          title="Watchlist"
          subtitle="Career pages"
          badge="3"
          actions={<button type="button">Run</button>}
        >
          <p>body</p>
        </PageFrame>
      </EmbeddedPage>,
    );
    expect(screen.queryByText(/app-header/)).toBeNull();
    expect(screen.queryByRole("main")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: /Watchlist/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Career pages")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
  });

  it("can hide the embedded heading when the host already shows one", () => {
    render(
      <EmbeddedPage hideHeading>
        <PageFrame
          icon={Eye}
          title="Watchlist"
          subtitle="Career pages"
          actions={<button type="button">Run</button>}
        >
          <p>body</p>
        </PageFrame>
      </EmbeddedPage>,
    );
    expect(screen.queryByRole("heading", { name: /Watchlist/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
  });
});
