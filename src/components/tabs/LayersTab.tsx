import { useState, useRef } from "react";
import { useStore } from "../../store";
import { newLayer } from "../../factory";
import { Btn, Panel, TextInput } from "../ui";

type DragKind = "layer" | "asset";
type DropPos = { type: "above" | "below"; id: string };

export default function LayersTab() {
  const data = useStore((s) => s.data())!;
  const [dragKind, setDragKind] = useState<DragKind | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ layerId: string; assetId: string | null; pos: "above" | "below" } | null>(null);
  const assetDraggingFromLayerRef = useRef<string | null>(null);

  const tab = useStore((s) => s.tab);
  const selId = useStore((s) => s.selId);
  const selKind = useStore((s) => s.selKind);
  const isLockedMode = tab === "zones" || tab === "paths";

  const orderedLayers = [...data.layers].reverse(); // top → bottom in UI = front → back on canvas

  // Returns assets of a layer in TOP-to-BOTTOM visual order (first = topmost in canvas).
  const visualAssets = (layerId: string, excludeId?: string) =>
    data.assets
      .filter((a) => a.layerId === layerId && a.id !== excludeId)
      .slice()
      .sort((a, b) => a.zoffset - b.zoffset)
      .reverse();

  const clearDrag = () => {
    setDragKind(null);
    setDraggedId(null);
    setDropHint(null);
    assetDraggingFromLayerRef.current = null;
  };

  // Compute which asset row is being hovered and whether drop point is above or
  // below it, based on pointer Y relative to the row bounding rect.
  const computeAssetDrop = (rowEl: HTMLElement, clientY: number) => {
    const rect = rowEl.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? "above" : "below";
  };
  const computeLayerDrop = (rowEl: HTMLElement, clientY: number) => {
    const rect = rowEl.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? "above" : "below";
  };

  // Reorder layers: move `movedId` next to `targetId` at `pos`.
  const reorderLayers = (movedId: string, targetId: string, pos: "above" | "below") => {
    if (movedId === targetId) return;
    useStore.getState().update((dd) => {
      // visual list = top → bottom
      const visual = [...dd.layers].reverse();
      const fromIdx = visual.findIndex((l) => l.id === movedId);
      const targetIdx = visual.findIndex((l) => l.id === targetId);
      if (fromIdx < 0 || targetIdx < 0) return;
      const [moved] = visual.splice(fromIdx, 1);
      let insertAt = visual.findIndex((l) => l.id === targetId);
      if (pos === "below") insertAt += 1;
      visual.splice(insertAt, 0, moved);
      dd.layers = [...visual].reverse();
    });
  };

  // Reorder assets (possibly across layers) using above/below semantics in VISUAL
  // (top→bottom) list, then remap to zoffset so that visual[0] gets highest zoffset.
  const reorderAsset = (
    movedId: string,
    targetLayerId: string,
    targetAssetId: string | null, // null => edge of layer
    pos: "above" | "below" | "top" | "bottom"
  ) => {
    useStore.getState().update((d) => {
      const moved = d.assets.find((a) => a.id === movedId);
      if (!moved) return;
      moved.layerId = targetLayerId;

      const inTarget = d.assets
        .filter((a) => a.layerId === targetLayerId && a.id !== movedId)
        .slice()
        .sort((a, b) => a.zoffset - b.zoffset)
        .reverse(); // visual top→bottom

      let insertAt: number;
      if (pos === "top") insertAt = 0;
      else if (pos === "bottom") insertAt = inTarget.length;
      else if (targetAssetId) {
        const idx = inTarget.findIndex((a) => a.id === targetAssetId);
        if (idx < 0) { insertAt = pos === "above" ? 0 : inTarget.length; }
        else insertAt = pos === "above" ? idx : idx + 1;
      } else {
        insertAt = pos === "above" ? 0 : inTarget.length;
      }

      inTarget.splice(insertAt, 0, moved);

      // Remap zoffset: bottom of visual list (lowest z) = 0, top = N-1
      const zBottomToTop = [...inTarget].reverse();
      zBottomToTop.forEach((asset, i) => { asset.zoffset = i; });
    });
  };

  const startLayerDrag = (id: string) => {
    if (isLockedMode) return;
    setDragKind("layer");
    setDraggedId(id);
    setDropHint(null);
  };
  const startAssetDrag = (id: string, layerId: string) => {
    if (isLockedMode) return;
    setDragKind("asset");
    setDraggedId(id);
    assetDraggingFromLayerRef.current = layerId;
    setDropHint(null);
  };

  const onLayerRowDragOver = (e: React.DragEvent, layerId: string) => {
    if (!dragKind || !draggedId || isLockedMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const row = e.currentTarget as HTMLElement;
    const pos = computeLayerDrop(row, e.clientY);
    // For asset drag, treat layer-row hover as top/bottom of the group's asset list
    if (dragKind === "asset") {
      setDropHint({ layerId, assetId: null, pos: pos === "above" ? "above" : "below" });
    } else {
      if (draggedId === layerId) { setDropHint(null); return; }
      setDropHint({ layerId, assetId: null, pos });
    }
  };

  const onLayerRowDrop = (e: React.DragEvent, layerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragKind || !draggedId || isLockedMode) { clearDrag(); return; }
    const row = e.currentTarget as HTMLElement;
    const pos = computeLayerDrop(row, e.clientY);
    if (dragKind === "layer") {
      if (draggedId !== layerId) reorderLayers(draggedId, layerId, pos);
    } else {
      // asset dropped on a layer header row: send to top or bottom of that layer
      reorderAsset(draggedId, layerId, null, pos === "above" ? "top" : "bottom");
    }
    clearDrag();
  };

  const onAssetRowDragOver = (e: React.DragEvent, layerId: string, assetId: string) => {
    if (dragKind !== "asset" || !draggedId || isLockedMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (draggedId === assetId) { setDropHint(null); return; }
    const row = e.currentTarget as HTMLElement;
    const pos = computeAssetDrop(row, e.clientY);
    setDropHint({ layerId, assetId, pos });
  };

  const onAssetRowDrop = (e: React.DragEvent, layerId: string, assetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragKind !== "asset" || !draggedId || isLockedMode) { clearDrag(); return; }
    if (draggedId === assetId) { clearDrag(); return; }
    const row = e.currentTarget as HTMLElement;
    const pos = computeAssetDrop(row, e.clientY);
    reorderAsset(draggedId, layerId, assetId, pos);
    clearDrag();
  };

  // Drop zones for the empty top edge (before first layer) and empty bottom edge
  // (after last layer) make it possible to send items to the very top/bottom.
  const onEdgeDragOver = (e: React.DragEvent, where: "top" | "bottom", layerId?: string) => {
    if (!dragKind || !draggedId || isLockedMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (layerId) {
      // edge of a specific layer's asset list
      if (dragKind !== "asset") return;
      setDropHint({ layerId, assetId: null, pos: where === "top" ? "above" : "below" });
    } else {
      // edge of the whole layer stack
      if (dragKind !== "layer") return;
      const targetLayerId = where === "top" ? orderedLayers[0]?.id : orderedLayers[orderedLayers.length - 1]?.id;
      if (!targetLayerId || targetLayerId === draggedId) { setDropHint(null); return; }
      setDropHint({ layerId: targetLayerId, assetId: null, pos: where === "top" ? "above" : "below" });
    }
  };
  const onEdgeDrop = (e: React.DragEvent, where: "top" | "bottom", layerId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragKind || !draggedId || isLockedMode) { clearDrag(); return; }
    if (layerId) {
      if (dragKind !== "asset") { clearDrag(); return; }
      reorderAsset(draggedId, layerId, null, where === "top" ? "top" : "bottom");
    } else {
      if (dragKind !== "layer") { clearDrag(); return; }
      const targetLayerId = where === "top" ? orderedLayers[0]?.id : orderedLayers[orderedLayers.length - 1]?.id;
      if (!targetLayerId || targetLayerId === draggedId) { clearDrag(); return; }
      reorderLayers(draggedId, targetLayerId, where === "top" ? "above" : "below");
    }
    clearDrag();
  };

  return (
    <Panel
      title="Layers (top → bottom)"
      action={
        <Btn variant="primary" onClick={() => !isLockedMode && useStore.getState().addLayer(newLayer())} disabled={isLockedMode}>
          + Layer
        </Btn>
      }
    >
      <p className="mb-2 text-[11px] text-slate-500">
        Gore u listi = iznad na canvasu. Prevuci <span className="text-slate-300">⠿</span> da pomeriš layer ili asset; plava linija pokazuje gde će pasti.
      </p>

      {/* Top edge drop zone (before any layers) */}
      <div
        onDragOver={(e) => onEdgeDragOver(e, "top")}
        onDragLeave={() => setDropHint((c) => (c && c.layerId === orderedLayers[0]?.id && c.assetId === null && c.pos === "above" ? null : c))}
        onDrop={(e) => onEdgeDrop(e, "top")}
        className={`mb-1 h-2 w-full rounded ${dropHint && dropHint.assetId === null && dropHint.layerId === orderedLayers[0]?.id && dropHint.pos === "above" ? "bg-emerald-500/80 h-2" : dragKind === "layer" ? "bg-transparent hover:bg-slate-800/40" : "bg-transparent"}`}
      />

      <div className="space-y-2">
        {orderedLayers.map((layer) => {
          const assets = visualAssets(layer.id);
          const isLayerSelected = selKind === "layer" && selId === layer.id;
          const layerDragging = dragKind === "layer" && draggedId === layer.id;
          const layerEdgeTop = dropHint?.layerId === layer.id && dropHint.assetId === null && dropHint.pos === "above";
          const layerEdgeBottom = dropHint?.layerId === layer.id && dropHint.assetId === null && dropHint.pos === "below";

          return (
            <div key={layer.id} className="relative">
              {/* Above-layer indicator */}
              {layerEdgeTop && <div className="pointer-events-none absolute -top-1 left-0 right-0 z-20 h-1 rounded bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />}

              <div
                draggable={!isLockedMode}
                onDragStart={(e) => {
                  // If drag started from an inner asset, don't also drag the layer.
                  if (isLockedMode) { e.preventDefault(); return; }
                  if (dragKind === "asset") { e.preventDefault(); return; }
                  startLayerDrag(layer.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", "layer:" + layer.id);
                }}
                onDragEnd={clearDrag}
                onDragOver={(e) => onLayerRowDragOver(e, layer.id)}
                onDragLeave={(e) => {
                  const rt = e.relatedTarget as HTMLElement | null;
                  if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) {
                    setDropHint((c) => (c && c.layerId === layer.id && c.assetId === null ? null : c));
                  }
                }}
                onDrop={(e) => onLayerRowDrop(e, layer.id)}
                onClick={(e) => { e.stopPropagation(); if (!isLockedMode) useStore.getState().select("layer", layer.id); }}
                className={`rounded-md border p-2 transition-colors ${isLayerSelected ? "border-violet-500 bg-violet-950/20" : "border-slate-800 bg-slate-800/40"} ${isLockedMode ? "pointer-events-none select-none opacity-70" : "cursor-grab active:cursor-grabbing"} ${layerDragging ? "opacity-40" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="select-none rounded px-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                    title="Prevuci sloj"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    ⠿
                  </span>
                  <TextInput
                    value={layer.name}
                    onChange={(v) => !isLockedMode && useStore.getState().updateLayer(layer.id, { name: v })}
                    disabled={isLockedMode}
                  />
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">{assets.length}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <IconBtn active={layer.visible} onClick={() => !isLockedMode && useStore.getState().updateLayer(layer.id, { visible: !layer.visible })} disabled={isLockedMode}>
                    {layer.visible ? "👁 Show" : "🚫 Hidden"}
                  </IconBtn>
                  <IconBtn active={!layer.locked} onClick={() => !isLockedMode && useStore.getState().updateLayer(layer.id, { locked: !layer.locked })} disabled={isLockedMode}>
                    {layer.locked ? "🔒 Locked" : "🔓 Unlocked"}
                  </IconBtn>
                  <IconBtn onClick={() => !isLockedMode && useStore.getState().duplicateLayer(layer.id)} disabled={isLockedMode}>⧉ Dup</IconBtn>
                  <IconBtn onClick={() => !isLockedMode && useStore.getState().removeLayer(layer.id)} danger disabled={isLockedMode}>🗑</IconBtn>
                </div>

                {/* Assets inside layer */}
                <div className="mt-2 rounded-md border border-slate-900 bg-slate-950/30 p-1">
                  {/* Top-of-assets drop zone */}
                  <div
                    onDragOver={(e) => onEdgeDragOver(e, "top", layer.id)}
                    onDragLeave={() => setDropHint((c) => (c && c.layerId === layer.id && c.assetId === null && c.pos === "above" ? null : c))}
                    onDrop={(e) => onEdgeDrop(e, "top", layer.id)}
                    className={`h-2 w-full rounded ${dropHint?.layerId === layer.id && dropHint.assetId === null && dropHint.pos === "above" && dragKind === "asset" ? "bg-emerald-500/80 h-2" : dragKind === "asset" ? "bg-transparent hover:bg-slate-800/40" : "bg-transparent"}`}
                  />

                  {assets.length === 0 && dragKind === "asset" && (
                    <div className="py-2 text-center text-[10px] text-slate-600">↳ baci ovde</div>
                  )}

                  {assets.map((a) => {
                    const media = data.media.find((m) => m.id === a.mediaId);
                    const isAssetSelected = selKind === "asset" && selId === a.id;
                    const isDraggingThis = dragKind === "asset" && draggedId === a.id;
                    const aboveMe = dropHint?.layerId === layer.id && dropHint.assetId === a.id && dropHint.pos === "above";
                    const belowMe = dropHint?.layerId === layer.id && dropHint.assetId === a.id && dropHint.pos === "below";
                    return (
                      <div key={a.id} className="relative">
                        {aboveMe && <div className="pointer-events-none absolute -top-0.5 left-0 right-0 z-10 h-0.5 rounded bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />}
                        <div
                          draggable={!isLockedMode}
                          onDragStart={(e) => {
                            if (isLockedMode) { e.preventDefault(); return; }
                            // Don't let layer dragStart swallow this.
                            e.stopPropagation();
                            startAssetDrag(a.id, layer.id);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", "asset:" + a.id);
                          }}
                          onDragEnd={(e) => { e.stopPropagation(); clearDrag(); }}
                          onDragOver={(e) => onAssetRowDragOver(e, layer.id, a.id)}
                          onDragLeave={(e) => {
                            const rt = e.relatedTarget as HTMLElement | null;
                            if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) {
                              setDropHint((c) => (c && c.assetId === a.id ? null : c));
                            }
                          }}
                          onDrop={(e) => onAssetRowDrop(e, layer.id, a.id)}
                          onClick={(e) => { e.stopPropagation(); if (!isLockedMode) useStore.getState().select("asset", a.id); }}
                          className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-[11px] border ${isAssetSelected ? "bg-violet-950/60 text-violet-200 border-violet-500" : "bg-slate-800/60 text-slate-300 border-transparent hover:bg-slate-800"} ${isLockedMode ? "pointer-events-none select-none opacity-70" : "cursor-grab active:cursor-grabbing"} ${isDraggingThis ? "opacity-40" : ""}`}
                        >
                          <span className="select-none text-[10px] text-slate-500" title="Prevuci asset">⠿</span>
                          {a.shape ? (
                            <span className="h-5 w-5 shrink-0 rounded border border-slate-600" style={{ background: a.shape.fill }} />
                          ) : (
                            <img src={media?.dataUrl} className="h-5 w-5 shrink-0 rounded object-contain bg-slate-900" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{a.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); useStore.getState().updateAsset(a.id, { visible: !a.visible }); }}
                            className="rounded px-1 py-0.5 text-[10px] hover:bg-slate-700"
                          >
                            {a.visible ? "👁" : "🚫"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); useStore.getState().updateAsset(a.id, { locked: !a.locked }); }}
                            className="rounded px-1 py-0.5 text-[10px] hover:bg-slate-700"
                          >
                            {a.locked ? "🔒" : "🔓"}
                          </button>
                        </div>
                        {belowMe && <div className="pointer-events-none absolute -bottom-0.5 left-0 right-0 z-10 h-0.5 rounded bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />}
                      </div>
                    );
                  })}

                  {/* Bottom-of-assets drop zone */}
                  <div
                    onDragOver={(e) => onEdgeDragOver(e, "bottom", layer.id)}
                    onDragLeave={() => setDropHint((c) => (c && c.layerId === layer.id && c.assetId === null && c.pos === "below" ? null : c))}
                    onDrop={(e) => onEdgeDrop(e, "bottom", layer.id)}
                    className={`mt-0.5 h-3 w-full rounded ${dropHint?.layerId === layer.id && dropHint.assetId === null && dropHint.pos === "below" && dragKind === "asset" ? "bg-emerald-500/60" : dragKind === "asset" ? "bg-slate-800/30 hover:bg-slate-700/50" : "bg-transparent"}`}
                  />
                </div>
              </div>

              {/* Below-layer indicator */}
              {layerEdgeBottom && <div className="pointer-events-none absolute -bottom-1 left-0 right-0 z-20 h-1 rounded bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />}
            </div>
          );
        })}
      </div>

      {/* Bottom edge drop zone (after all layers) */}
      <div
        onDragOver={(e) => onEdgeDragOver(e, "bottom")}
        onDragLeave={() => setDropHint((c) => (c && c.layerId === orderedLayers[orderedLayers.length - 1]?.id && c.assetId === null && c.pos === "below" ? null : c))}
        onDrop={(e) => onEdgeDrop(e, "bottom")}
        className={`mt-1 h-2 w-full rounded ${dropHint && dropHint.assetId === null && dropHint.layerId === orderedLayers[orderedLayers.length - 1]?.id && dropHint.pos === "below" ? "bg-emerald-500/80 h-2" : dragKind === "layer" ? "bg-transparent hover:bg-slate-800/40" : "bg-transparent"}`}
      />
    </Panel>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2 py-1 text-[11px] ${
        danger
          ? "bg-rose-950/50 text-rose-300 hover:bg-rose-900/50"
          : active
          ? "bg-slate-700 text-slate-100"
          : "bg-slate-900 text-slate-400 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}
