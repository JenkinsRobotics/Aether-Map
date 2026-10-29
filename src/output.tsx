import { useVisualMotionInputs } from './live/use-visual-motion-inputs';
import { TimelineAudioProvider } from './live/TimelineAudioContext';
import { TimelineAudio } from './panels/TimelineAudio';
import { sceneVisuals } from './visual-render';
import { advanceShow, clipAt, playerShow, showForClip, startRun, withShowAudio } from './show-timeline';
import { ModulationContext } from "./features/ModulationContext";
import { DEFAULT_LFOS } from "./features/types";
import { sceneSize } from "./scene-size";
import { useEffect, useId, useRef, useState } from "react";
import { outputForHotkey, sceneForHotkey } from "./scene-hotkeys";
import { sourcePictureStyle, alphaProjectionStyle, placementProjectionStyle } from "./source-picture";
import { clipStyle } from "./mask/clip";
import { OutlineEdge, outlineEdged } from "./features/SurfaceGrid";
import { ClipDefs } from "./mask/clip.tsx";
import { mappingSurfaceAt, playbackEnded, showTime, transportTime, type ResolvedSurface, type Transport } from "./playback";
import { watchDeployedLayout } from "./deployed-layout";
import { deployedElapsedS } from './deployed-playback';
import { outputChannel, type ChannelMessage, LINK_TIMEOUT_MS } from "./output-session";
import { cropTransform, outputRegion } from "./output-crop";
import { useLiveOutput } from "./live/output-live";
import { TestPattern } from "./features/TestPattern";
import { SurfaceMedia } from "./SurfaceMedia";
import { replaceLocationQuery } from "./location-history";
import { outputMappingLook, outputView } from "./output-view";
import {
  emptyShow,
  findOutput,
  sceneLayers,
  showForOutput,
  type MapShow,
  type Surface,
  type SurfaceAppearance,
} from "./document";

/** Where a deployed device keeps the media it downloaded. */
const LOCAL_MEDIA = "media/";
const HOSTED_MEDIA = "/api/map/media/";

/**
 * The projector's picture: surfaces and nothing else. Same warp and the same
 * evaluation as the editor canvas — no chrome, no handles, no grid.
 *
 * Two ways to arrive here, one component:
 *   - a second window on a laptop, fed over BroadcastChannel by the editor;
 *   - a deployed device, playing `layout.json` from its own disk with the
 *     network gone.
 */
/** One shared empty map, so a show carrying no media does not re-render the
 *  whole projector on every message by handing it a different `{}` each time. */
const NO_MEDIA: Record<string, string> = {};

export function OutputView() {
  const motionInputs=useVisualMotionInputs();
  // State, not a constant read of the URL: an editor holding an unsaved draft
  // renames its channel when autosave gives the show a document id, and hands
  // this window over rather than leaving it listening to a dead name.
  const [session, setSession] = useState(() => new URLSearchParams(location.search).get("session"));
  const windowKind = new URLSearchParams(location.search).get("windowKind") ?? "monitor";
  // Which of the show's outputs this window is. A deployed device has no id in
  // its URL and falls back to the first output, which is what a one-output show
  // and every migrated file have.
  const outputID = new URLSearchParams(location.search).get("outputID");
  useLiveOutput(session, "output");
  const clean = new URLSearchParams(location.search).has("wireless") || !session;
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [show, setShow] = useState<MapShow>(emptyShow);
  const [previewMode, setPreviewMode] = useState<"mapping" | "visualization">("visualization");
  const [transport, setTransport] = useState<Transport>(() => ({
    playing: true,
    timeS: 0,
    anchorMs: Date.now(),
  }));
  const [source, setSource] = useState<"waiting" | "deployed" | "live">("waiting");
  // When this window last heard from its editor. An output that has stopped
  // hearing must stop playing: a projector showing a confidently animating
  // render of a state nobody holds any more is worse than one that says so.
  // When the editor was last heard from. A ref, not state: it changes on every
  // message — once per pointer move while someone drags — and the watchdog below
  // would otherwise tear down and rebuild its interval at that same rate. It is
  // never read during render, so nothing wants it to be state.
  const heardAt = useRef(0);
  const [linked, setLinked] = useState(true);
  const [timeS, setTimeS] = useState(0);
  const [showRun, setShowRun] = useState(startRun), run = useRef(showRun);
  const hostRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  // Wall-clock minute, for an output with a schedule. It re-arms on each
  // boundary rather than polling on an interval, so showtime starts on the
  // minute and a Pi left alone for a week does not drift off it. Nothing but a
  // scheduled output reads this, and an unscheduled one re-renders once a
  // minute with identical results, which costs nothing measurable.
  const [minute, setMinute] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = Date.now();
      timer = setTimeout(() => { setMinute(new Date()); arm(); }, 60_000 - (now % 60_000));
    };
    arm();
    return () => clearTimeout(timer);
  }, []);
  // This window renders its own output's scene. Binding it as the active scene
  // means evaluation, sizing and surface lookup need no notion of "which output
  // is asking" — one window's scene is simply the active scene, from its view.
  // A function key pressed on the player takes this output to that scene.
  const [hotScene, setHotScene] = useState<string | null>(null);
  const hotShow = useRef(show); hotShow.current = show;
  useEffect(() => {
    const pressed = (event: MessageEvent) => {
      if (event.origin !== location.origin || typeof event.data?.aetherHotkey !== "string") return;
      const scene = sceneForHotkey(hotShow.current, event.data.aetherHotkey);
      if (scene) setHotScene(scene);
    };
    addEventListener("message", pressed);
    return () => removeEventListener("message", pressed);
  }, []);
  const output = outputForHotkey(findOutput(show, outputID), hotScene);
  const bound = showForOutput(show, output, minute);
  const { width, height } = sceneSize(bound);

  useEffect(() => {
    if (session) return;
    return watchDeployedLayout((next) => {
      setShow(next);
      setTransport({ playing: true, timeS: 0, anchorMs: Date.now() });
      setSource("deployed");
    });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const channel = new BroadcastChannel(outputChannel(session));
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data?.type === "rekey") {
        // Follow the editor to its new channel, and leave the URL pointing
        // there so reloading this window lands on it too.
        const next = event.data.session;
        setSession((current) => {
          if (current === next) return current;
          const query = new URLSearchParams(location.search);
          query.set("session", next);
          replaceLocationQuery(query);
          return next;
        });
        return;
      }
      if (event.data?.type !== "show") return;
      setShow(event.data.show);
      setPreviewMode(event.data.previewMode === "mapping" ? "mapping" : "visualization");
      setTransport(event.data.transport);
      setMediaUrls(event.data.mediaUrls ?? NO_MEDIA);
      setSource("live");
      heardAt.current = Date.now();
      setLinked(true);
    };
    channel.postMessage({ type: "hello" } satisfies ChannelMessage);
    return () => channel.close();
  }, [session]);

  // Silence past the timeout means the editor that owned this window is gone —
  // reloaded, navigated away or closed. Deployed devices have no editor and are
  // exempt.
  useEffect(() => {
    if (source !== "live") return;
    const check = setInterval(
      () => setLinked(heardAt.current > 0 && Date.now() - heardAt.current < LINK_TIMEOUT_MS),
      1000,
    );
    return () => clearInterval(check);
  }, [source]);

  // The projector runs its own clock from the transport anchor rather than
  // being fed a frame at a time, so playback stays smooth and the channel quiet.
  // An unlinked output holds its last frame instead of running on alone.
  // The loop reads the latest show and transport through a ref rather than
  // depending on them: a channel message arrives structured-cloned, so `show` is
  // never referentially equal even when nothing about it changed, and listing it
  // here cancelled and rescheduled this clock on every edit the editor
  // published — once per pointer move of a drag, which is exactly when the
  // projector most needs to be left alone.
  const clock = useRef({ show: bound, transport, source, schedule:output?.schedule });
  useEffect(() => { clock.current = { show: bound, transport, source, schedule:output?.schedule }; }, [bound, transport, source, output?.schedule]);
  useEffect(() => {
    if (!linked) return;
    let frame = 0;
    const tick = () => {
      const now = clock.current;
      const elapsed = now.source === 'deployed' ? deployedElapsedS(now.schedule,now.transport.anchorMs,Date.now()) : transportTime(now.transport);
      setTimeS(showTime(now.show, elapsed));
      // A deployed player runs the show on its own, cues included.
      if (now.source === 'deployed') { run.current = advanceShow(run.current, playerShow(now.show), elapsed, now.show.playback.mode); setShowRun(run.current); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [linked]);

  // Measure the render area in CSS pixels, not the editor's screen or a
  // guessed physical resolution. Resizing/fullscreen immediately updates it.
  useEffect(() => {
    const channel = session ? new BroadcastChannel(outputChannel(session)) : null;
    const report = () => {
      const size = { width: innerWidth, height: innerHeight };
      setDevice(size);
      channel?.postMessage({
        type: "device",
        windowKind,
        outputID: outputID ?? "",
        ...size,
        fullscreen: Boolean(document.fullscreenElement),
      } satisfies ChannelMessage);
    };
    if (channel) channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data?.type === "request-device" && event.data.outputID === outputID) report();
    };
    report();
    addEventListener("resize", report);
    addEventListener("pageshow", report);
    addEventListener("focus", report);
    document.addEventListener("fullscreenchange", report);
    return () => {
      removeEventListener("resize", report);
      removeEventListener("pageshow", report);
      removeEventListener("focus", report);
      document.removeEventListener("fullscreenchange", report);
      channel?.close();
    };
  }, [session, windowKind, outputID]);

  useEffect(() => {
    document.title = "Aether Map — Output";
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void hostRef.current?.requestFullscreen();
  };

  const base = source === "deployed" ? LOCAL_MEDIA : HOSTED_MEDIA;
  // This window renders its own output's scene. Binding it as the active scene
  // means evaluation, sizing and surface lookup need no notion of "which output
  // is asking" — one window's scene is simply the active scene, from its view.
  const mapping = outputView(output, previewMode, Boolean(session)) === "mapping";
  // A deployed player plays the show: this output's canvas follows its track
  // on the show timeline, rendering whichever scene clip is under the playhead.
  const program = playerShow(show), showLength = program?.durationS ?? 0;
  const showS = showRun.showS;
  const showClip = !hotScene && source === 'deployed' && output?.sceneId && showLength ? clipAt(show, output.sceneId, showS, program) : null;
  const resolved = showClip ? showForClip(bound, output!.sceneId!, showClip.clip) : bound;
  const frameS = showClip ? showClip.localS : timeS;
  // Between clips the show is dark on this canvas.
  const idle = !hotScene && source === 'deployed' && !!output?.sceneId && !!showLength && !showClip;
  // Cue-driven blackout and pause on a player running the show itself.
  const dark = show.output.blackout || (source === 'deployed' && showRun.blackout), held = source === 'deployed' && showRun.paused;
  // sceneCrop already shows an unconfigured output the whole scene, for every
  // transport — a monitor window and a wireless one had no business differing.
  const crop = outputRegion(bound, output, { width, height });
  const transform = cropTransform(crop, device);

  return (
    <TimelineAudioProvider><ModulationContext.Provider value={{ lfos: show.lfos ?? DEFAULT_LFOS, timeS }}>
    <div ref={hostRef} className="map-output" data-preview={mapping ? "mapping" : "visualization"} data-link={source === "live" ? (linked ? "live" : "lost") : source} onDoubleClick={toggleFullscreen}>
      {source === 'deployed' && <TimelineAudio show={showClip || idle ? withShowAudio(bound, program) : bound} timeS={showClip || idle ? showS : timeS} playing={transport.playing && !held && !playbackEnded(bound, timeS)} urls={Object.fromEntries(show.media.map(m => [m.id, `${LOCAL_MEDIA}${m.file}`]))} />}
      <div
        className="map-raster map-output-raster"
        style={{ width, height, transform, clipPath: `polygon(${crop.xPx}px ${crop.yPx}px, ${crop.xPx + crop.widthPx}px ${crop.yPx}px, ${crop.xPx + crop.widthPx}px ${crop.yPx + crop.heightPx}px, ${crop.xPx}px ${crop.yPx + crop.heightPx}px)` }}
      >
        {/* One layer normally; two while a crossfade is riding between scenes. */}
        {!idle && !dark && !show.output.testPattern && sceneLayers(resolved).map((layer) => (
          <div key={layer.scene.id} className="map-mix-layer" style={{ opacity: layer.opacity }}>
            {(mapping ? layer.scene.surfaces.filter(s => !s.sceneCanvas) : sceneVisuals(resolved, layer.scene, frameS, Boolean(session), undefined, motionInputs)).map((surface) => (
          <OutputSurface
            key={surface.id}
            surface={surface}
            show={resolved}
            base={base}
            urls={mediaUrls}
            timeS={frameS}
            playing={transport.playing && !held && !playbackEnded(bound, timeS)}
            mapping={mapping}
            // Only while an editor is driving this window: that is the align
            // step. A deployed show must never paint a pattern onto a building
            // mid-performance.
            placeholder={session ? outputMappingLook(bound, output) : undefined}
          />
            ))}
          </div>
        ))}
      </div>
      {source === "waiting" && !clean && (
        <div className="map-output-hint">
          <strong>Aether Map output</strong>
          <p>
            Drag this window onto the projector, then double-click to go fullscreen.
            Waiting for the editor…
          </p>
        </div>
      )}
      {source === "live" && !linked && !clean && (
        <div className="map-output-hint map-output-unlinked" role="status">
          <strong>Not linked to an editor</strong>
          <p>
            This output stopped hearing from the editor that opened it, so it is
            holding its last frame rather than playing on. Open the output again
            from the editor to take this window over.
          </p>
        </div>
      )}
      {!dark && show.output.testPattern && <TestPattern style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}

    </div>
    </ModulationContext.Provider></TimelineAudioProvider>
  );
}

export function OutputSurface({
  surface,
  show,
  base,
  urls,
  timeS,
  playing,
  placeholder,
  mapping = false,
}: {
  surface: Surface;
  show: MapShow;
  base: string;
  urls?: Record<string, string>;
  timeS: number;
  playing: boolean;
  /**
   * Which pattern to paint for a surface that has no media yet, so its warp is
   * visible on the wall. Aligning a projection to a physical contour is done by
   * looking at the projected shape, which is impossible if an empty surface
   * emits nothing. Omitted paints nothing.
   */
  placeholder?: SurfaceAppearance;
  /** Live editor calibration: base geometry and pattern, independent of content. */
  mapping?: boolean;
}) {
  const clipID = `clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (mapping) {
    const geometry = mappingSurfaceAt(surface, 0, show.media, false);
    surface = { ...geometry, opacity: 1,
      source: { mediaId: null, rect: geometry.source.rect,
        ...(surface.kind === "mask" ? { fill: "#000000" } : {}) } };
  }
  if (!surface.enabled || surface.opacity <= 0) return null;
  const media = show.media.find((m) => m.id === surface.source.mediaId);

  let style: React.CSSProperties;
  try {
    style = sourcePictureStyle(surface, media);
  } catch {
    return null;
  }

  const src = media ? urls?.[media.file] ?? base + media.file : "";
  const outlined = Boolean(placeholder && !media && outlineEdged(surface));

  return (
    <>
      <ClipDefs surface={surface} clipID={clipID} />
      <div
        className="map-surface"
        style={{ ...clipStyle(surface, clipID), opacity: surface.opacity }}
      >
        <SurfaceMedia placementProjection={placementProjectionStyle(surface, media)} bend={surface.bend} alphaMask={surface.alphaMask} alphaProjection={alphaProjectionStyle(surface, media)}
          source={surface.source}
          url={media ? src : undefined}
          kind={media?.kind}
          text={surface.source.text}
          fill={surface.source.fill}
          loop={(surface as ResolvedSurface).mediaLoop ?? surface.clips.length === 0}
          style={style}
          timeS={(surface as ResolvedSurface).mediaTimeS ?? timeS}
          playing={playing}
          placeholder={placeholder}
          placeholderEdge={!outlined}
        />
        {outlined && <OutlineEdge surface={surface} look={placeholder!} />}
      </div>
    </>
  );
}
