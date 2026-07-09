import { useState, useRef } from "react";
import { useStore } from "../../store";
import { newLayer } from "../../factory";
import { Btn, Panel, TextInput } from "../ui";

type DragKind = "layer" | "asset";

export default function LayersTab() {
  const data = useStore((s) => s.data())!;
  const [dragKind, setDragKind] = useState<DragKind | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ layerId: string; assetId: string | null; pos: "above" | "below" } | null>(null);
  const assetDraggingFromLayerRef = useRef<string | null>(null);

  // Used to allow dragging only when the ⠿ handle is the origin
  const layerDragAllowedRef = useRef(false);
  const assetDragAllowedRef = useRef(false);

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
    layerDragAllowedRef.current = false;
    assetDragAllowedRef.current = false;
  };

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

  // Reorder assets (possibly across layers)
  const reorderAsset = (
    movedId: string,
    targetLayerId: string,
    targetAssetId: string | null,
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
        .reverse();

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
      const zBottomToTop = [...inTarget].reverse();
      zBottomToTop.forEach((asset, i) => { asset.zoffset = i; });
    });
  };

  // --- Layer drag handlers (only via ⠿ handle) ---
  const onLayerHandleMouseDown = () => {
    layerDragAllowedRef.current = true;
  };
  const onLayerDragStart = (e: React.DragEvent, layerId: string) => {
    if (isLockedMode || !layerDragAllowedRef.current) { e.preventDefault(); return; }
    setDragKind("layer");
    setDraggedId(layerId);
    setDropHint(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "layer:" + layerId);
  };
  const onLayerDragEnd = () => {
    clearDrag();
  };

  // Layer row receives dragOver/drop only for layer-kind drags
  const onLayerRowDragOver = (e: React.DragEvent, layerId: string) => {
    if (dragKind !== "layer" || !draggedId || isLockedMode) {
      // Allow asset drag-over to pass through to asset drop zones inside
      if (dragKind === "asset") {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (draggedId === layerId) { setDropHint(null); return; }
    const row = e.currentTarget as HTMLElement;
    const pos = computeLayerDrop(row, e.clientY);
    setDropHint({ layerId, assetId: null, pos });
  };

  const onLayerRowDrop = (e: React.DragEvent, layerId: string) => {
    if (dragKind !== "layer" || !draggedId || isLockedMode) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggedId !== layerId) {
      const row = e.currentTarget as HTMLElement;
      const pos = computeLayerDrop(row, e.clientY);
      reorderLayers(draggedId, layerId, pos);
    }
    clearDrag();
  };

  // --- Asset drag handlers (only via ⠿ handle) ---
  const onAssetHandleMouseDown = () => {
    assetDragAllowedRef.current = true;
  };
  const onAssetDragStart = (e: React.DragEvent, assetId: string, layerId: string) => {
    if (isLockedMode || !assetDragAllowedRef.current) { e.preventDefault(); return; }
    e.stopPropagation();
    setDragKind("asset");
    setDraggedId(assetId);
    assetDraggingFromLayerRef.current = layerId;
    setDropHint(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "asset:" + assetId);
  };
  const onAssetDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
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

  // Edge drop zones for asset list (top/bottom of a layer's asset list)
  const onAssetEdgeDragOver = (e: React.DragEvent, layerId: string, pos: "above" | "below") => {
    if (dragKind !== "asset" || !draggedId || isLockedMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropHint({ layerId, assetId: null, pos });
  };
  const onAssetEdgeDrop = (e: React.DragEvent, layerId: string, pos: "above" | "below") => {
    e.preventDefault();
    e.stopPropagation();
    if (dragKind !== "asset" || !draggedId || isLockedMode) { clearDrag(); return; }
    reorderAsset(draggedId, layerId, null, pos === "above" ? "top" : "bottom");
    clearDrag();
  };

  // Global edge drop zones for layers (very top / very bottom)
  const onLayerEdgeDragOver = (e: React.DragEvent, where: "top" | "bottom") => {
    if (dragKind !== "layer" || !draggedId || isLockedMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const targetId = where === "top" ? orderedLayers[0]?.id : orderedLayers[orderedLayers.length - 1]?.id;
    if (!targetId || targetId === draggedId) { setDropHint(null); return; }
    setDropHint({ layerId: targetId, assetId: null, pos: where === "top" ? "above" : "below" });
  };
  const onLayerEdgeDrop = (e: React.DragEvent, where: "top" | "bottom") => {
    e.preventDefault();
    e.stopPropagation();
    if (dragKind !== "layer" || !draggedId || isLockedMode) { clearDrag(); return; }
    const targetId = where === "top" ? orderedLayers[0]?.id : orderedLayers[orderedLayers.length - 1]?.id;
    if (!targetId || targetId === draggedId) { clearDrag(); return; }
    reorderLayers(draggedId, targetId, where === "top" ? "above" : "below");
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
        Gore u listi = iznad na canvasu. Prevuci <span className="text-slate-300">⠿</span> da pomeriš layer grupu ili asset; zelena linija pokazuje gde će pasti.
      </p>

      {/* Top edge drop zone for layers */}
      <div
        onDragOver={(e) => onLayerEdgeDragOver(e, "top")}
        onDragLeave={() => setDropHint((c) => (c && c.layerId === orderedLayers[0]?.id && c.assetId === null && c.pos === "above" ? null : c))}
        onDrop={(e) => onLayerEdgeDrop(e, "top")}
        className={`mb-1 h-2 w-full rounded transition-colors ${
          dropHint && dropHint.assetId === null && dropHint.layerId === orderedLayers[0]?.id && dropHint.pos === "above" && dragKind === "layer"
            ? "bg-emerald-500"
            : dragKind === "layer" ? "bg-transparent hover:bg-slate-800/40" : "bg-transparent"
        }`}
      />

      <div className="space-y-1">
        {orderedLayers.map((layer) => {
          const assets = visualAssets(layer.id);
          const isLayerSelected = selKind === "layer" && selId === layer.id;
          const layerDragging = dragKind === "layer" && draggedId === layer.id;

          // For layer drop hints: show a line between groups, not highlight the group
          const showAboveLine = dropHint?.layerId === layer.id && dropHint.assetId === null && dropHint.pos === "above" && dragKind === "layer";
          const showBelowLine = dropHint?.layerId === layer.id && dropHint.assetId === null && dropHint.pos === "below" && dragKind === "layer";

          return (
            <div key={layer.id} className="relative">
              {/* Green line ABOVE layer group */}
              {showAboveLine && (
                <div className="pointer-events-none absolute -top-0.5 left-0 right-0 z-20 h-0.5 rounded bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              )}

              {/* Layer group container — NOT draggable itself; only handle triggers drag */}
              <div
                onDragOver={(e) => onLayerRowDragOver(e, layer.id)}
                onDragLeave={(e) => {
                  const rt = e.relatedTarget as HTMLElement | null;
                  if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) {
                    setDropHint((c) => (c && c.layerId === layer.id && c.assetId === null ? null : c));
                  }
                }}
                onDrop={(e) => onLayerRowDrop(e, layer.id)}
                onClick={(e) => { e.stopPropagation(); if (!isLockedMode) useStore.getState().select("layer", layer.id); }}
                className={`rounded-md border p-2 transition-colors ${
                  isLayerSelected ? "border-violet-500 bg-violet-950/20" : "border-slate-800 bg-slate-800/40"
                } ${isLockedMode ? "pointer-events-none select-none opacity-70" : ""} ${layerDragging ? "opacity-40" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  {/* Layer drag handle — draggable only when this handle is used */}
                  <span
                    draggable={!isLockedMode}
                    onMouseDown={onLayerHandleMouseDown}
                    onDragStart={(e) => onLayerDragStart(e, layer.id)}
                    onDragEnd={onLayerDragEnd}
                    className="select-none cursor-grab active:cursor-grabbing rounded px-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                    title="Prevuci layer grupu"
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
                    onDragOver={(e) => onAssetEdgeDragOver(e, layer.id, "above")}
                    onDragLeave={() => setDropHint((c) => (c && c.layerId === layer.id && c.assetId === null && c.pos === "above" ? null : c))}
                    onDrop={(e) => onAssetEdgeDrop(e, layer.id, "above")}
                    className={`h-2 w-full rounded transition-colors ${
                      dropHint?.layerId === layer.id && dropHint.assetId === null && dropHint.pos === "above" && dragKind === "asset"
                        ? "bg-emerald-500"
                        : dragKind === "asset" ? "hover:bg-slate-700/40" : ""
                    }`}
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
                        {/* Asset row — NOT draggable on the whole row; only ⠿ handle triggers drag */}
                        <div
                          onDragOver={(e) => onAssetRowDragOver(e, layer.id, a.id)}
                          onDragLeave={(e) => {
                            const rt = e.relatedTarget as HTMLElement | null;
                            if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) {
                              setDropHint((c) => (c && c.assetId === a.id ? null : c));
                            }
                          }}
                          onDrop={(e) => onAssetRowDrop(e, layer.id, a.id)}
                          onClick={(e) => { e.stopPropagation(); if (!isLockedMode) useStore.getState().select("asset", a.id); }}
                          className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-[11px] border ${
                            isAssetSelected ? "bg-violet-950/60 text-violet-200 border-violet-500" : "bg-slate-800/60 text-slate-300 border-transparent hover:bg-slate-800"
                          } ${isLockedMode ? "pointer-events-none select-none opacity-70" : ""} ${isDraggingThis ? "opacity-40" : ""}`}
                        >
                          {/* Asset drag handle — only this span is draggable */}
                          <span
                            draggable={!isLockedMode}
                            onMouseDown={onAssetHandleMouseDown}
                            onDragStart={(e) => onAssetDragStart(e, a.id, layer.id)}
                            onDragEnd={onAssetDragEnd}
                            className="select-none cursor-grab active:cursor-grabbing text-[10px] text-slate-500 hover:text-slate-300 px-0.5"
                            title="Prevuci asset"
                          >
                            ⠿
                          </span>
                          {a.shape ? (
                            <span className="h-5 w-5 shrink-0 rounded border border-slate-600" style={{ background: a.shape.fill }} />
                          ) : a.gradient ? (
                            <span className="h-5 w-5 shrink-0 rounded border border-slate-600 bg-gradient-to-br from-violet-500 to-pink-500" title="Gradient" />
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
                    onDragOver={(e) => onAssetEdgeDragOver(e, layer.id, "below")}
                    onDragLeave={() => setDropHint((c) => (c && c.layerId === layer.id && c.assetId === null && c.pos === "below" ? null : c))}
                    onDrop={(e) => onAssetEdgeDrop(e, layer.id, "below")}
                    className={`mt-0.5 h-3 w-full rounded transition-colors ${
                      dropHint?.layerId === layer.id && dropHint.assetId === null && dropHint.pos === "below" && dragKind === "asset"
                        ? "bg-emerald-500/60"
                        : dragKind === "asset" ? "bg-slate-800/20 hover:bg-slate-700/40" : "bg-transparent"
                    }`}
                  />
                </div>
              </div>

              {/* Green line BELOW layer group */}
              {showBelowLine && (
                <div className="pointer-events-none absolute -bottom-0.5 left-0 right-0 z-20 h-0.5 rounded bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom edge drop zone for layers */}
      <div
        onDragOver={(e) => onLayerEdgeDragOver(e, "bottom")}
        onDragLeave={() => setDropHint((c) => (c && c.layerId === orderedLayers[orderedLayers.length - 1]?.id && c.assetId === null && c.pos === "below" ? null : c))}
        onDrop={(e) => onLayerEdgeDrop(e, "bottom")}
        className={`mt-1 h-2 w-full rounded transition-colors ${
          dropHint && dropHint.assetId === null && dropHint.layerId === orderedLayers[orderedLayers.length - 1]?.id && dropHint.pos === "below" && dragKind === "layer"
            ? "bg-emerald-500"
            : dragKind === "layer" ? "bg-transparent hover:bg-slate-800/40" : "bg-transparent"
        }`}
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
