import { useStore } from "../../store";
import { Btn, Field, NumberInput, Panel, Select, Slider, TextInput, Toggle } from "../ui";
import type { AssetFit, BlendMode, ShapeKind, BehaviorAnimation, OneShotAnimation } from "../../types";
import { uid } from "../../factory";

const REF_POINTS = [
  [0, 0], [0.5, 0], [1, 0],
  [0, 0.5], [0.5, 0.5], [1, 0.5],
  [0, 1], [0.5, 1], [1, 1],
];

export default function AssetInspector() {
  const data = useStore((s) => s.data())!;
  const selId = useStore((s) => s.selId)!;
  const a = data.assets.find((x) => x.id === selId);
  if (!a) return null;
  const set = (patch: Partial<typeof a>) => useStore.getState().update((d) => {
    const target = d.assets.find((x) => x.id === a.id);
    if (target) Object.assign(target, patch);
  });

  const media = a.mediaId ? data.media.find((m) => m.id === a.mediaId) : undefined;
  const W = data.canvasWidth;
  const H = data.canvasHeight;

  const align = (hx: 0 | 1 | 2, vy: 0 | 1 | 2) => {
    // Treat as simple shape / canvas alignment context even if on background layer
    set({
      x: hx === 0 ? 0 : hx === 1 ? (W - a.width) / 2 : W - a.width,
      y: vy === 0 ? 0 : vy === 1 ? (H - a.height) / 2 : H - a.height,
    });
  };

  const mediaRatio = (media?.width ?? a.width) / Math.max(1, media?.height ?? a.height);
  const isMediaAsset = !a.shape && !!media && !a.gradient;

  const canvasFill = (fit: AssetFit) => {
    if (a.gradient) { set({ x: 0, y: 0, width: W, height: H, fit: "fill" }); return; }
    if (!isMediaAsset) { set({ x: 0, y: 0, width: W, height: H, fit }); return; }
    const containScale = Math.min(W / Math.max(1, media?.width ?? a.width), H / Math.max(1, media?.height ?? a.height));
    const coverScale = Math.max(W / Math.max(1, media?.width ?? a.width), H / Math.max(1, media?.height ?? a.height));
    const s = fit === "cover" || fit === "fill" ? coverScale : containScale;
    const width = Math.round((media?.width ?? a.width) * s);
    const height = Math.round((media?.height ?? a.height) * s);
    set({ x: Math.round((W - width) / 2), y: Math.round((H - height) / 2), width, height, fit: fit === "fill" ? "cover" : fit });
  };
  const resizeByWidth = (width: number) => {
    const nextW = Math.max(10, width);
    set(isMediaAsset ? { width: nextW, height: Math.max(10, Math.round(nextW / mediaRatio)) } : { width: nextW });
  };
  const resizeByHeight = (height: number) => {
    const nextH = Math.max(10, height);
    set(isMediaAsset ? { height: nextH, width: Math.max(10, Math.round(nextH * mediaRatio)) } : { height: nextH });
  };

  const sizePresets: { label: string; apply: () => void }[] = [
    { label: "Full canvas", apply: () => canvasFill("contain") },
    { label: "½ canvas", apply: () => resizeByWidth(W / 2) },
    { label: "⅓ canvas", apply: () => resizeByWidth(W / 3) },
    { label: "¼ canvas", apply: () => resizeByWidth(W / 4) },
    {
      label: "Fit width",
      apply: () => set({ x: 0, width: W, height: Math.round(W / mediaRatio) }),
    },
    {
      label: "Fit height",
      apply: () => set({ y: 0, height: H, width: Math.round(H * mediaRatio) }),
    },
    ...(media?.width && media?.height
      ? [{ label: "Original size", apply: () => set({ width: media.width!, height: media.height! }) }]
      : []),
  ];

  const updateShape = (patch: Partial<NonNullable<typeof a.shape>>) => {
    if (!a.shape) return;
    set({ shape: { ...a.shape, ...patch } });
  };

  return (
    <div>
      <Panel title="Asset">
        <Field label="Name">
          <TextInput value={a.name} onChange={(v) => set({ name: v })} />
        </Field>
        <div className="grid grid-cols-2 gap-1.5">
          <Field label="Layer">
            <Select
              value={a.layerId}
              onChange={(v) => set({ layerId: v })}
              options={data.layers.map((l) => ({ value: l.id, label: l.name }))}
            />
          </Field>
          <Field label="Blend">
            <Select
              value={a.blend}
              onChange={(v) => set({ blend: v as BlendMode })}
              options={[
                { value: "normal", label: "Normal" },
                { value: "screen", label: "Screen" },
                { value: "multiply", label: "Multiply" },
                { value: "overlay", label: "Overlay" },
                { value: "lighten", label: "Lighten" },
                { value: "add", label: "Add / Glow" },
              ]}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Toggle label="Visible" checked={a.visible} onChange={(v) => set({ visible: v })} />
          <Toggle label="Locked" checked={a.locked} onChange={(v) => set({ locked: v })} />
        </div>
        {(media?.type === "lottie" || media?.type === "svg") && (
          <Btn variant="primary" className="w-full" onClick={() => useStore.getState().setTab(media.type === "lottie" ? "lottie" : "svg")}>✏️ Edit {media.type.toUpperCase()}</Btn>
        )}
        <div className="flex gap-1.5">
          <Btn className="flex-1" onClick={() => useStore.getState().duplicateAsset(a.id)}>⧉ Duplicate</Btn>
          <Btn variant="danger" onClick={() => { useStore.getState().removeAsset(a.id); useStore.getState().select(null, null); }}>🗑</Btn>
        </div>
      </Panel>

      <Panel title="Transform">
        <div className="grid grid-cols-4 gap-1.5">
          <Field label="X"><NumberInput value={a.x} onChange={(v) => set({ x: v })} /></Field>
          <Field label="Y"><NumberInput value={a.y} onChange={(v) => set({ y: v })} /></Field>
          <Field label="W"><NumberInput value={a.width} onChange={resizeByWidth} /></Field>
          <Field label="H"><NumberInput value={a.height} onChange={resizeByHeight} /></Field>
        </div>
        <Slider label="Rotation" min={-180} max={180} value={a.rotation} onChange={(v) => set({ rotation: v })} format={(v) => `${v}°`} />
        <Slider label="Opacity" min={0} max={1} step={0.05} value={a.opacity} onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <div className="grid grid-cols-2 gap-1.5">
          <Btn onClick={() => set({ flipH: !a.flipH })}>↔ Flip H {a.flipH ? "✓" : ""}</Btn>
          <Btn onClick={() => set({ flipV: !a.flipV })}>↕ Flip V {a.flipV ? "✓" : ""}</Btn>
        </div>
      </Panel>

      <Panel title="Fit to Canvas">
        <Field label="Fill entire canvas with:">
          <div className="grid grid-cols-4 gap-1">
            {(["contain", "cover", "fill", "auto"] as AssetFit[]).map((fit) => (
              <button
                key={fit}
                onClick={() => canvasFill(fit)}
                className={`rounded border px-1 py-1.5 text-[10px] capitalize font-medium ${
                  (a.fit ?? "contain") === fit && a.width === W && a.height === H && a.x === 0 && a.y === 0
                    ? "border-violet-500 bg-violet-500/20 text-violet-200"
                    : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-violet-500"
                }`}
              >
                {fit}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[9px] leading-3 text-slate-500">
            Resizes asset to <b>Full Canvas ({W}×{H})</b>.
          </p>
        </Field>
      </Panel>

      <Panel title="Manual Size & Align">
        <Field label="Size presets">
          <div className="grid grid-cols-3 gap-1">
            {sizePresets.map((p) => (
              <button
                key={p.label}
                onClick={p.apply}
                className="rounded border border-slate-700 bg-slate-800/40 px-1 py-1 text-[10px] text-slate-300 hover:border-violet-500 hover:text-violet-200"
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Align on canvas (9-point)">
          <div className="mx-auto grid w-28 grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/50 p-1.5">
            {([0, 1, 2] as const).flatMap((vy) =>
              ([0, 1, 2] as const).map((hx) => (
                <button
                  key={`${hx}-${vy}`}
                  title={`${["top", "middle", "bottom"][vy]} ${["left", "center", "right"][hx]}`}
                  onClick={() => align(hx, vy)}
                  className="group flex h-7 items-center justify-center rounded border border-slate-700 bg-slate-800/50 hover:border-violet-500 hover:bg-violet-500/20"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 group-hover:bg-violet-200" />
                </button>
              ))
            )}
          </div>
        </Field>
      </Panel>

      {a.shape && (
        <Panel title="Shape Style">
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Type">
              <Select
                value={a.shape.kind}
                onChange={(v) => updateShape({ kind: v as ShapeKind })}
                options={[
                  { value: "rect", label: "Rectangle" },
                  { value: "ellipse", label: "Ellipse" },
                  { value: "triangle", label: "Triangle" },
                  { value: "line", label: "Line" },
                  { value: "diamond", label: "Diamond" },
                  { value: "pentagon", label: "Pentagon" },
                  { value: "hexagon", label: "Hexagon" },
                  { value: "star", label: "Star" },
                ]}
              />
            </Field>
            <Field label="Z-offset">
              <NumberInput value={a.zoffset} onChange={(v) => set({ zoffset: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Fill">
              <input type="color" value={a.shape.fill} onChange={(e) => updateShape({ fill: e.target.value })} className="h-7 w-full rounded" />
            </Field>
            <Field label="Stroke">
              <input type="color" value={a.shape.stroke} onChange={(e) => updateShape({ stroke: e.target.value })} className="h-7 w-full rounded" />
            </Field>
          </div>
          <Slider label="Stroke width" min={0} max={24} value={a.shape.strokeWidth} onChange={(v) => updateShape({ strokeWidth: v })} />
          {a.shape.kind === "rect" && <Slider label="Corner radius" min={0} max={50} value={a.shape.radius} onChange={(v) => updateShape({ radius: v })} />}
        </Panel>
      )}

      <Panel title="Behavior Animation" defaultCollapsed>
        <Field label="Animation">
          <Select
            value={a.animation || "none"}
            onChange={(v) => set({ animation: v as BehaviorAnimation })}
            options={[
              { value: "none", label: "None" },
              { value: "pendulum", label: "Pendulum (Swing)" },
              { value: "rotation", label: "Rotation (Spin)" },
              { value: "float", label: "Floating (Up/Down)" },
              { value: "pulse", label: "Pulsing (Size)" },
              { value: "bounce", label: "Bouncing" },
              { value: "shake", label: "Shaking (Glitch)" },
              { value: "wiggle", label: "Wiggling (Side-to-Side)" },
              { value: "skew", label: "Skewing" },
              { value: "blur", label: "Focus Pulse (Blur)" },
              { value: "heartbeat", label: "Heartbeat" },
              { value: "sway", label: "Sway" },
              { value: "jelly", label: "Jelly / Squash" },
              { value: "breathe", label: "Breathe" },
              { value: "drift", label: "Drift" },
              { value: "glitch", label: "Glitch" },
              { value: "orbit", label: "Orbit" },
              { value: "tada", label: "Tada" },
            ]}
          />
        </Field>
        {a.animation && a.animation !== "none" && (
          <div className="space-y-3 pt-2">
            <Slider label="Animation Intensity/Speed" min={0.1} max={5} step={0.1} value={a.animSpeed ?? 1} onChange={(v) => set({ animSpeed: v })} />
            
            <Field label="Reference Point (Pivot)">
              <div className="mx-auto grid w-24 grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/50 p-1.5">
                {REF_POINTS.map(([x, y], i) => (
                  <button
                    key={i}
                    onClick={() => set({ refPointX: x, refPointY: y })}
                    className={`h-5 w-full rounded border transition flex items-center justify-center ${
                      (a.refPointX ?? 0.5) === x && (a.refPointY ?? 0.5) === y
                        ? "border-violet-500 bg-violet-600/30"
                        : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                    }`}
                  >
                    <div className={`h-1 w-1 rounded-full ${(a.refPointX ?? 0.5) === x && (a.refPointY ?? 0.5) === y ? "bg-white" : "bg-slate-600"}`} />
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[9px] text-center text-slate-500 italic">Sets the anchor for rotation and swing.</p>
            </Field>
          </div>
        )}
      </Panel>

      <Panel title="Advanced Parallax" defaultCollapsed>
        <Toggle
          label="Enable Parallax"
          checked={!!a.parallax?.enabled}
          onChange={(v) => set({ parallax: { ...(a.parallax || { trigger: "mouse", factorX: 20, factorY: 20, smoothing: 0.1 }), enabled: v } })}
        />
        {a.parallax?.enabled && (
          <div className="mt-2 space-y-3 pt-2">
            <Field label="Trigger Source">
              <Select
                value={a.parallax.trigger || "mouse"}
                onChange={(v) => set({ parallax: { ...a.parallax!, trigger: v as "mouse" | "tilt" } })}
                options={[
                  { value: "mouse", label: "Mouse Movement" },
                  { value: "tilt", label: "Device Tilt / Gyro" },
                ]}
              />
            </Field>
            <Slider
              label="Horizontal Factor (X)"
              min={-100}
              max={100}
              value={a.parallax.factorX ?? 20}
              onChange={(v) => set({ parallax: { ...a.parallax!, factorX: v } })}
              format={(v) => `${v}px`}
            />
            <Slider
              label="Vertical Factor (Y)"
              min={-100}
              max={100}
              value={a.parallax.factorY ?? 20}
              onChange={(v) => set({ parallax: { ...a.parallax!, factorY: v } })}
              format={(v) => `${v}px`}
            />
            <Slider
              label="Smoothing (Lerp)"
              min={0.01}
              max={1.0}
              step={0.01}
              value={a.parallax.smoothing ?? 0.1}
              onChange={(v) => set({ parallax: { ...a.parallax!, smoothing: v } })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        )}
      </Panel>

      <Panel title="Audio-Reactive Behavior" defaultCollapsed>
        <Toggle
          label="Enable Audio-Reactive"
          checked={!!a.audioReactive?.enabled}
          onChange={(v) => set({ audioReactive: { ...(a.audioReactive || { frequency: "bass", sensitivity: 5, smoothing: 0.5, affectScale: true, affectRotation: false, affectPosition: false, affectOpacity: false }), enabled: v } })}
        />
        {a.audioReactive?.enabled && (
          <div className="mt-2 space-y-3 pt-2">
            <Field label="Frequency Band">
              <Select
                value={a.audioReactive.frequency || "bass"}
                onChange={(v) => set({ audioReactive: { ...a.audioReactive!, frequency: v as "bass" | "mid" | "treble" | "full" } })}
                options={[
                  { value: "bass", label: "Bass (Low Freq)" },
                  { value: "mid", label: "Mids (Voice/vocals)" },
                  { value: "treble", label: "Treble (High Freq)" },
                  { value: "full", label: "Full Range (Loudness)" },
                ]}
              />
            </Field>
            <Slider
              label="Sensitivity"
              min={1}
              max={15}
              step={0.5}
              value={a.audioReactive.sensitivity ?? 5}
              onChange={(v) => set({ audioReactive: { ...a.audioReactive!, sensitivity: v } })}
            />
            <Slider
              label="Smoothing"
              min={0}
              max={0.95}
              step={0.05}
              value={a.audioReactive.smoothing ?? 0.5}
              onChange={(v) => set({ audioReactive: { ...a.audioReactive!, smoothing: v } })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2 space-y-1.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">Audio affects…</div>
              <Toggle
                label="Scale (Pulsing)"
                checked={!!a.audioReactive.affectScale}
                onChange={(v) => set({ audioReactive: { ...a.audioReactive!, affectScale: v } })}
              />
              <Toggle
                label="Rotation (Wobbling)"
                checked={!!a.audioReactive.affectRotation}
                onChange={(v) => set({ audioReactive: { ...a.audioReactive!, affectRotation: v } })}
              />
              <Toggle
                label="Opacity (Flickering)"
                checked={!!a.audioReactive.affectOpacity}
                onChange={(v) => set({ audioReactive: { ...a.audioReactive!, affectOpacity: v } })}
              />
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Event-Action Builder (Interactive)" defaultCollapsed>
        <p className="text-[10px] leading-4 text-slate-400 mb-2">
          Create chains of interactive behaviors. Clicking, hovering, or holding this asset can trigger multiple actions (sounds, animations, particle bursts, etc.) at once!
        </p>
        <div className="space-y-3">
          {(!a.interactiveEvents || a.interactiveEvents.length === 0) ? (
            <p className="text-[10px] text-slate-500 italic text-center py-2">No event triggers defined yet.</p>
          ) : (
            a.interactiveEvents.map((t, tIdx) => {
              const changeTriggerType = (type: any) => {
                const nextTriggers = a.interactiveEvents!.map(trig => {
                  if (trig.id === t.id) return { ...trig, type };
                  return trig;
                });
                set({ interactiveEvents: nextTriggers });
              };
              const removeTrigger = () => {
                const nextTriggers = a.interactiveEvents!.filter(trig => trig.id !== t.id);
                set({ interactiveEvents: nextTriggers });
              };
              const addActionToTrigger = () => {
                const nextTriggers = a.interactiveEvents!.map(trig => {
                  if (trig.id === t.id) {
                    return {
                      ...trig,
                      actions: [
                        ...trig.actions,
                        { id: uid(), type: "sound" as const, volume: 0.8 }
                      ]
                    };
                  }
                  return trig;
                });
                set({ interactiveEvents: nextTriggers });
              };
              return (
                <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-[11px] font-bold text-violet-300">Trigger #{tIdx + 1}</span>
                    <button onClick={removeTrigger} className="text-[10px] text-rose-400 hover:text-rose-200">Remove</button>
                  </div>
                  <Field label="Trigger Event">
                    <Select
                      value={t.type}
                      onChange={(v) => changeTriggerType(v as any)}
                      options={[
                        { value: "click", label: "On Click" },
                        { value: "dblclick", label: "On Double Click" },
                        { value: "mouseenter", label: "On Hover Enter" },
                        { value: "mouseleave", label: "On Hover Leave" },
                        { value: "contextmenu", label: "On Right Click" },
                        { value: "hold", label: "On Hold (Long Press)" },
                      ]}
                    />
                  </Field>

                  <div className="space-y-2 pl-2 border-l border-violet-500/30">
                    <div className="text-[9px] uppercase tracking-wide text-slate-500">Actions</div>
                    {t.actions.map((act, actIdx) => {
                      const changeActionType = (type: any) => {
                        const nextTriggers = a.interactiveEvents!.map(trig => {
                          if (trig.id === t.id) {
                            return {
                              ...trig,
                              actions: trig.actions.map(a => {
                                if (a.id === act.id) return { id: a.id, type };
                                return a;
                              })
                            };
                          }
                          return trig;
                        });
                        set({ interactiveEvents: nextTriggers });
                      };
                      const updateActionParam = (patch: any) => {
                        const nextTriggers = a.interactiveEvents!.map(trig => {
                          if (trig.id === t.id) {
                            return {
                              ...trig,
                              actions: trig.actions.map(a => {
                                if (a.id === act.id) return { ...a, ...patch };
                                return a;
                              })
                            };
                          }
                          return trig;
                        });
                        set({ interactiveEvents: nextTriggers });
                      };
                      const removeAction = () => {
                        const nextTriggers = a.interactiveEvents!.map(trig => {
                          if (trig.id === t.id) {
                            return {
                              ...trig,
                              actions: trig.actions.filter(a => a.id !== act.id)
                            };
                          }
                          return trig;
                        });
                        set({ interactiveEvents: nextTriggers });
                      };
                      return (
                        <div key={act.id} className="rounded border border-slate-900 bg-slate-900/40 p-2 space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-900/60 pb-1">
                            <span className="text-[10px] font-semibold text-slate-300">Action #{actIdx + 1}</span>
                            <button onClick={removeAction} className="text-[9px] text-slate-500 hover:text-rose-400">×</button>
                          </div>
                          <Field label="Action Type">
                            <Select
                              value={act.type}
                              onChange={(v) => changeActionType(v as any)}
                              options={[
                                { value: "sound", label: "Play Sound FX" },
                                { value: "animation", label: "Play Animation Trigger" },
                                { value: "visibility", label: "Toggle Layer Visibility" },
                                { value: "particle", label: "Spawn Particle Burst" },
                                { value: "open_url", label: "Open Web URL" },
                                { value: "script", label: "Execute Custom Script" },
                              ]}
                            />
                          </Field>

                          {act.type === "sound" && (
                            <div className="space-y-1.5 pt-1">
                              <Field label="Sound File">
                                <Select
                                  value={act.soundMediaId || ""}
                                  onChange={(v) => updateActionParam({ soundMediaId: v })}
                                  options={[
                                    { value: "", label: "-- Select media --" },
                                    ...data.media.map(m => ({ value: m.id, label: m.name }))
                                  ]}
                                />
                              </Field>
                              <Slider
                                label="Volume"
                                min={0}
                                max={1}
                                step={0.05}
                                value={act.volume ?? 0.8}
                                onChange={(v) => updateActionParam({ volume: v })}
                                format={(v) => `${Math.round(v * 100)}%`}
                              />
                            </div>
                          )}

                          {act.type === "animation" && (
                            <Field label="Animation Name">
                              <Select
                                value={act.animationName || ""}
                                onChange={(v) => updateActionParam({ animationName: v })}
                                options={[
                                  { value: "", label: "-- Select animation --" },
                                  { value: "pendulum", label: "Pendulum (Swing)" },
                                  { value: "rotation", label: "Rotation (Spin)" },
                                  { value: "float", label: "Floating (Up/Down)" },
                                  { value: "pulse", label: "Pulsing (Size)" },
                                  { value: "bounce", label: "Bouncing" },
                                  { value: "shake", label: "Shaking" },
                                  { value: "wiggle", label: "Wiggling" },
                                  { value: "glitch", label: "Glitch" },
                                  { value: "tada", label: "Tada" },
                                ]}
                              />
                            </Field>
                          )}

                          {act.type === "visibility" && (
                            <Field label="Target Asset to Toggle">
                              <Select
                                value={act.targetAssetId || ""}
                                onChange={(v) => updateActionParam({ targetAssetId: v })}
                                options={[
                                  { value: "", label: "-- Select asset --" },
                                  ...data.assets.filter(x => x.id !== a.id).map(x => ({ value: x.id, label: x.name }))
                                ]}
                              />
                            </Field>
                          )}

                          {act.type === "particle" && (
                            <Field label="Target Particle System">
                              <Select
                                value={act.targetParticleId || ""}
                                onChange={(v) => updateActionParam({ targetParticleId: v })}
                                options={[
                                  { value: "", label: "-- Select system --" },
                                  ...data.particles.map(x => ({ value: x.id, label: x.name }))
                                ]}
                              />
                            </Field>
                          )}

                          {act.type === "open_url" && (
                            <Field label="Web URL">
                              <TextInput
                                value={act.url || ""}
                                onChange={(v) => updateActionParam({ url: v })}
                                placeholder="https://example.com"
                              />
                            </Field>
                          )}

                          {act.type === "script" && (
                            <Field label="Custom JS Script">
                              <textarea
                                rows={6}
                                value={act.script || ""}
                                onChange={(e) => updateActionParam({ script: e.target.value })}
                                className="w-full rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] text-emerald-400 outline-none focus:ring-1 focus:ring-violet-500"
                                placeholder="// Access 'engine' (the runtime) and 'asset' (this asset)&#10;// Example:&#10;// engine.root.style.background = 'red';&#10;// console.log(asset.name);"
                              />
                            </Field>
                          )}
                        </div>
                      );
                    })}
                    <Btn onClick={addActionToTrigger} className="w-full text-[9px] py-1 border border-dashed border-violet-500/40 hover:bg-violet-500/10">＋ Add Action</Btn>
                  </div>
                </div>
              );
            })
          )}
          <Btn onClick={() => {
            const nextTriggers = [...(a.interactiveEvents || []), { id: uid(), type: "click" as const, actions: [] }];
            set({ interactiveEvents: nextTriggers });
          }} variant="primary" className="w-full text-xs">＋ Add Event Trigger</Btn>
        </div>
      </Panel>

      <Panel title="Entrance Animation" defaultCollapsed>
        <Field label="How asset appears">
          <Select
            value={a.entranceAnim || "none"}
            onChange={(v) => set({ entranceAnim: v as OneShotAnimation })}
            options={[
              { value: "none", label: "None" },
              { value: "fade", label: "Fade in" },
              { value: "scale", label: "Scale in" },
              { value: "pop", label: "Pop in" },
              { value: "spin", label: "Spin in" },
              { value: "slide-up", label: "Slide up" },
              { value: "slide-down", label: "Slide down" },
              { value: "slide-left", label: "Slide left" },
              { value: "slide-right", label: "Slide right" },
            ]}
          />
        </Field>
        {(a.entranceAnim && a.entranceAnim !== "none") && <Slider label="Entrance duration" min={0.1} max={10} step={0.1} value={a.entranceDuration ?? 0.6} onChange={(v) => set({ entranceDuration: v })} format={(v) => `${v}s`} />}
      </Panel>

      <Panel title="Exit Animation" defaultCollapsed>
        <Field label="How asset disappears">
          <Select
            value={a.exitAnim || "none"}
            onChange={(v) => set({ exitAnim: v as OneShotAnimation })}
            options={[
              { value: "none", label: "None" },
              { value: "fade", label: "Fade out" },
              { value: "scale", label: "Scale out" },
              { value: "pop", label: "Pop out" },
              { value: "spin", label: "Spin out" },
              { value: "slide-up", label: "Slide up" },
              { value: "slide-down", label: "Slide down" },
              { value: "slide-left", label: "Slide left" },
              { value: "slide-right", label: "Slide right" },
            ]}
          />
        </Field>
        {(a.exitAnim && a.exitAnim !== "none") && <Slider label="Exit duration" min={0.1} max={10} step={0.1} value={a.exitDuration ?? 0.6} onChange={(v) => set({ exitDuration: v })} format={(v) => `${v}s`} />}
      </Panel>

      <Panel title="Glow / Drop Shadow" defaultCollapsed>
        <Toggle label="Enable effect" checked={!!a.shadow?.enabled} onChange={(v) => set({ shadow: { ...(a.shadow || { color: "#000000", blur: 10, offsetX: 0, offsetY: 0 }), enabled: v } })} />
        {a.shadow?.enabled && (
          <div className="mt-2 space-y-2">
            <Field label="Color">
              <input type="color" value={a.shadow.color} onChange={(e) => set({ shadow: { ...a.shadow!, color: e.target.value } })} className="h-7 w-full rounded" />
            </Field>
            <Slider label="Blur" min={0} max={100} value={a.shadow.blur} onChange={(v) => set({ shadow: { ...a.shadow!, blur: v } })} />
            <div className="grid grid-cols-2 gap-1.5">
              <Field label="Offset X"><NumberInput value={a.shadow.offsetX} onChange={(v) => set({ shadow: { ...a.shadow!, offsetX: v } })} /></Field>
              <Field label="Offset Y"><NumberInput value={a.shadow.offsetY} onChange={(v) => set({ shadow: { ...a.shadow!, offsetY: v } })} /></Field>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
