// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

it("shows an autosave recovery action instead of an empty root after a render failure", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never { throw new Error("broken surface"); }
  render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
  expect(screen.getByRole("alert").textContent).toContain("reopen this workspace");
  expect(screen.getByRole("button", { name: "Reopen workspace" })).toBeTruthy();
  expect(screen.getByText("broken surface")).toBeTruthy();
  error.mockRestore();
});
