import * as api from "@client/api";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Accordion } from "@/components/ui/accordion";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";

vi.mock("@client/api", () => ({
  changeOwnPassword: vi.fn(),
  createWorkspaceUser: vi.fn(),
  getCurrentAuthUser: vi.fn(),
  getSsoProviders: vi.fn(),
  listSsoIdentities: vi.fn(),
  listWorkspaceUsers: vi.fn(),
  resetWorkspaceUserPassword: vi.fn(),
  setWorkspaceUserDisabled: vi.fn(),
  startSsoLink: vi.fn(),
  unlinkSsoIdentity: vi.fn(),
}));

const EnvironmentSettingsHarness = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const methods = useForm<UpdateSettingsInput>({
    defaultValues: {
      ukvisajobsEmail: "visa@example.com",
      ukvisajobsPassword: "",
      adzunaAppId: "adzuna-id",
      adzunaAppKey: "",
      webhookSecret: "",
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <FormProvider {...methods}>
        <Accordion type="multiple" defaultValue={["environment"]}>
          <EnvironmentSettingsSection
            values={{
              readable: {
                ukvisajobsEmail: "visa@example.com",
                adzunaAppId: "adzuna-id",
              },
              private: {
                ukvisajobsPasswordHint: "pass",
                adzunaAppKeyHint: "adzu",
                webhookSecretHint: "sec-",
              },
            }}
            isLoading={false}
            isSaving={false}
          />
        </Accordion>
      </FormProvider>
    </QueryClientProvider>
  );
};

describe("EnvironmentSettingsSection", () => {
  beforeEach(() => {
    vi.mocked(api.getCurrentAuthUser).mockResolvedValue({
      id: "admin-user",
      username: "admin",
      displayName: "Admin User",
      isSystemAdmin: true,
      isDisabled: false,
      hasPassword: true,
      workspaceId: "tenant-admin",
      workspaceName: "Admin Workspace",
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    });
    vi.mocked(api.listWorkspaceUsers).mockResolvedValue([
      {
        id: "workspace-user",
        username: "member",
        displayName: "Member User",
        isSystemAdmin: false,
        isDisabled: false,
        hasPassword: true,
        workspaceId: "tenant-member",
        workspaceName: "Member Workspace",
        createdAt: "2026-05-13T00:00:00.000Z",
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
    ]);
    vi.mocked(api.getSsoProviders).mockResolvedValue([]);
    vi.mocked(api.listSsoIdentities).mockResolvedValue([]);
  });

  it("renders the Security group and leaves out hidden sources' accounts", () => {
    render(<EnvironmentSettingsHarness />);

    // UK Visa Jobs and Adzuna are hidden sources in this fork.
    expect(screen.queryByDisplayValue("visa@example.com")).toBeNull();
    expect(screen.queryByDisplayValue("adzuna-id")).toBeNull();
    expect(screen.queryByText("Service Accounts")).toBeNull();
    expect(
      screen.queryByLabelText("Enable authentication"),
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("username")).not.toBeInTheDocument();

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.queryByText("RxResume")).not.toBeInTheDocument();
  });

  it("updates a workspace user's reset password without crashing", async () => {
    render(<EnvironmentSettingsHarness />);

    const resetPasswordInput =
      await screen.findByPlaceholderText("New password");

    fireEvent.change(resetPasswordInput, {
      target: { value: "new-password" },
    });

    expect(resetPasswordInput).toHaveValue("new-password");
  });
});
