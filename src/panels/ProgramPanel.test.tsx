// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgramPanel } from "./ProgramPanel";
import { emptyShow, newScene, type MapShow } from "../document";

afterEach(cleanup);

function showWithScenes(...names: string[]): MapShow {
  const base = emptyShow();
  const scenes = names.map((name) => newScene(name));
  return { ...base, scenes, activeSceneId: scenes[0].id };
}

describe("ProgramPanel", () => {
  it("names both ends of the fader, so it cannot read as one scene's opacity", () => {
    const show = showWithScenes("Front", "Lobby");
    render(<ProgramPanel show={{ ...show, mix: { sceneId: show.scenes[1].id, blend: 0.74 } }}
      onMix={() => {}} onShowChange={() => {}} />);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText(/74% Lobby/)).toBeTruthy();
    expect(screen.getByText(/26% Front/)).toBeTruthy();
  });

  it("says a crossfade needs two scenes rather than showing a dead fader", () => {
    render(<ProgramPanel show={showWithScenes("Only")} onMix={() => {}} onShowChange={() => {}} />);
    expect(screen.queryByLabelText("Crossfade between scenes")).toBeNull();
    expect(screen.getByText(/Add a second scene/)).toBeTruthy();
  });

  it("will not offer a suppressed scene to fade to", () => {
    const show = showWithScenes("Front", "Lobby", "Parked");
    show.scenes[2].suppressed = true;
    render(<ProgramPanel show={show} onMix={() => {}} onShowChange={() => {}} />);
    const picker = screen.getByLabelText("Scene to fade toward") as HTMLSelectElement;
    const labels = Array.from(picker.options).map((option) => option.label);
    expect(labels).toEqual(["No crossfade", "Fade to Lobby"]);
  });

  it("keeps an engaged suppressed scene listed, so the fader never points at nothing", () => {
    const show = showWithScenes("Front", "Parked");
    show.scenes[1].suppressed = true;
    render(<ProgramPanel show={{ ...show, mix: { sceneId: show.scenes[1].id, blend: 0.5 } }}
      onMix={() => {}} onShowChange={() => {}} />);
    const picker = screen.getByLabelText("Scene to fade toward") as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.label)).toContain("Fade to Parked (suppressed)");
  });

  it("carries the panic controls, which are the other thing you reach for mid-show", () => {
    const onShowChange = vi.fn();
    render(<ProgramPanel show={showWithScenes("Front", "Lobby")} onMix={() => {}} onShowChange={onShowChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Blackout" }));
    expect(onShowChange).toHaveBeenCalledWith(expect.objectContaining({ blackout: true }));
  });
});
