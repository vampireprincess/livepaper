import { useRef, useState, useEffect } from "react";
import { useStore } from "../../store";
import { readFiles } from "../../media";
import { newCanvasAsset } from "../../factory";
import { Btn, EmptyHint, Panel } from "../ui";

export default function CodeTab() {
  const data = useStore((s) => s.data())!;
  const selId = useStore((s) => s.selId);
  const selKind = useStore((s) => s.selKind);
  const addMedia = useStore((s) => s.addMedia);
  const inputRef = useRef<HTMLInputElement>(null);

  const [codeDraft, setCodeDraft] = useState("");
  const [editingAssetId, setEditingMediaId] = useState<string | null>(null);

  // Find selected asset and media
  const activeAsset = selKind === "asset" && selId ? data.assets.find(x => x.id === selId) : undefined;
  const activeMedia = activeAsset?.mediaId ? data.media.find(m => m.id === activeAsset.mediaId) : undefined;
  const isWidgetSelected = activeMedia?.type === "widget";

  // Load code from media dataUrl
  useEffect(() => {
    if (isWidgetSelected && activeMedia) {
      try {
        const raw = activeMedia.dataUrl.startsWith("data:") 
          ? atob(activeMedia.dataUrl.split(",")[1]) 
          : activeMedia.dataUrl;
        setCodeDraft(raw);
        setEditingMediaId(activeMedia.id);
      } catch (e) {
        setCodeDraft(activeMedia.dataUrl);
      }
    } else {
      setCodeDraft("");
      setEditingMediaId(null);
    }
  }, [selId, activeMedia]);

  const onUpload = async (files: FileList | null) => {
    if (!files) return;
    const media = await readFiles(files);
    media.forEach((m) => {
      m.categoryId = "static-assets";
      m.inLibrary = false;
      addMedia(m);
      const asset = newCanvasAsset(m.id, data.layers[0].id, m);
      useStore.getState().addAsset(asset);
      useStore.getState().select("asset", asset.id);
    });
  };

  const saveCode = () => {
    if (!editingAssetId) return;
    const encoded = btoa(unescape(encodeURIComponent(codeDraft)));
    const dataUrl = `data:text/html;base64,${encoded}`;
    useStore.getState().update((d) => {
      const m = d.media.find(x => x.id === editingAssetId);
      if (m) m.dataUrl = dataUrl;
    });
    // Force runtime rebuild
    window.dispatchEvent(new CustomEvent("liveobs-force-runtime-rebuild"));
  };

  // Find all assets of type widget
  const widgetAssets = data.assets.filter(a => {
    const m = data.media.find(x => x.id === a.mediaId);
    return m?.type === "widget";
  });

  return (
    <div className="space-y-3">
      <Panel title="Import HTML Widget">
        <input ref={inputRef} type="file" accept=".html" multiple hidden onChange={(e) => onUpload(e.target.files)} />
        <Btn variant="primary" className="w-full" onClick={() => inputRef.current?.click()}>
          ⬆ Upload Gotcha HTML Widget
        </Btn>
        <p className="mt-1 text-[10px] text-slate-500">
          Upload any <b>HTML / JS / CSS</b> file. It will render natively on your canvas as an interactive widget!
        </p>
      </Panel>

      <Panel title="Placed Widgets">
        {widgetAssets.length === 0 ? (
          <EmptyHint>No custom code widgets placed yet.</EmptyHint>
        ) : (
          <div className="space-y-1">
            {widgetAssets.map((a) => {
              const sel = selId === a.id && selKind === "asset";
              return (
                <button
                  key={a.id}
                  onClick={() => useStore.getState().select("asset", a.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                    sel ? "border-violet-500 bg-violet-500/10 text-white" : "border-slate-800 bg-slate-800/30 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className="text-xl">🌐</span>
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {isWidgetSelected && activeMedia && (
        <Panel title={`Live Code Editor: ${activeMedia.name}`}>
          <div className="space-y-2">
            <textarea
              rows={12}
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              className="w-full rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[10px] text-emerald-400 outline-none focus:ring-1 focus:ring-violet-500 whitespace-pre overflow-auto"
              placeholder="<!-- Write HTML, CSS or JS here -->"
            />
            <Btn variant="primary" className="w-full" onClick={saveCode}>
              💾 Save Code & Apply
            </Btn>
            <p className="text-[9px] text-slate-500 italic text-center">
              Changes apply instantly to your Test Runtime and exported scene!
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}