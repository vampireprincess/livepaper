import { useRef, useState, useEffect } from "react";
import { useStore } from "../../store";
import { readFiles } from "../../media";
import { newCanvasAsset, uid } from "../../factory";
import { Btn, EmptyHint, Panel } from "../ui";
import JSZip from "jszip";
import type { WidgetFile, MediaAsset } from "../../types";

const compileWidgetCode = (files: WidgetFile[]): string => {
  const mainHtmlFile = files.find(f => f.name === "index.html") 
    || files.find(f => f.name.endsWith(".html") && !f.name.includes("/")) 
    || files.find(f => f.name.endsWith(".html")) 
    || { name: "index.html", content: "<html><body>No HTML file found.</body></html>" };

  let html = mainHtmlFile.content.startsWith("data:") 
    ? atob(mainHtmlFile.content.split(",")[1]) 
    : mainHtmlFile.content;

  // Create file map: name -> Data URL
  const fileMap: Record<string, string> = {};
  files.forEach(f => {
    let dataUrl = "";
    if (f.content.startsWith("data:")) {
      dataUrl = f.content;
    } else {
      const mime = f.type || (f.name.endsWith(".css") ? "text/css" : f.name.endsWith(".js") ? "application/javascript" : "text/plain");
      dataUrl = `data:${mime};base64,${btoa(unescape(encodeURIComponent(f.content)))}`;
    }
    fileMap[f.name.replace(/^\.\//, "")] = dataUrl;
  });

  // Inline CSS Stylesheet links
  const linkRegex = /<link\s+[^>]*href=["']([^"']+)["'][^>]*>/g;
  html = html.replace(linkRegex, (match, href) => {
    const cleanHref = href.replace(/^\.\//, "");
    const file = files.find(f => f.name.replace(/^\.\//, "") === cleanHref);
    if (file && file.name.endsWith(".css")) {
      const cssContent = file.content.startsWith("data:") ? atob(file.content.split(",")[1]) : file.content;
      return `<style>${cssContent}</style>`;
    }
    return match;
  });

  // Inline Script tags
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/g;
  html = html.replace(scriptRegex, (match, src) => {
    const cleanSrc = src.replace(/^\.\//, "");
    const file = files.find(f => f.name.replace(/^\.\//, "") === cleanSrc);
    if (file && file.name.endsWith(".js")) {
      const jsContent = file.content.startsWith("data:") ? atob(file.content.split(",")[1]) : file.content;
      return `<script>${jsContent}</script>`;
    }
    return match;
  });

  // Inline Image tags
  const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/g;
  html = html.replace(imgRegex, (match, src) => {
    const cleanSrc = src.replace(/^\.\//, "");
    const dataUrl = fileMap[cleanSrc];
    if (dataUrl) {
      return match.replace(`src="${src}"`, `src="${dataUrl}"`).replace(`src='${src}'`, `src='${dataUrl}'`);
    }
    return match;
  });

  // Inline CSS background image urls
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
  html = html.replace(urlRegex, (match, url) => {
    const cleanUrl = url.replace(/^\.\//, "");
    const dataUrl = fileMap[cleanUrl];
    if (dataUrl) {
      return `url("${dataUrl}")`;
    }
    return match;
  });

  const encoded = btoa(unescape(encodeURIComponent(html)));
  return `data:text/html;base64,${encoded}`;
};

export default function CodeTab() {
  const data = useStore((s) => s.data())!;
  const selId = useStore((s) => s.selId);
  const selKind = useStore((s) => s.selKind);
  const addMedia = useStore((s) => s.addMedia);
  const inputRef = useRef<HTMLInputElement>(null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Find selected asset and media
  const activeAsset = selKind === "asset" && selId ? data.assets.find(x => x.id === selId) : undefined;
  const activeMedia = activeAsset?.mediaId ? data.media.find(m => m.id === activeAsset.mediaId) : undefined;
  const isWidgetSelected = activeMedia?.type === "widget";

  const parseZip = async (file: File): Promise<WidgetFile[]> => {
    const zip = await JSZip.loadAsync(file);
    const files: WidgetFile[] = [];
    const promises: Promise<void>[] = [];
    
    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      const promise = (async () => {
        const name = zipEntry.name;
        let type = "text/plain";
        let content = "";
        
        if (name.endsWith(".html")) {
          type = "text/html";
          content = await zipEntry.async("text");
        } else if (name.endsWith(".css")) {
          type = "text/css";
          content = await zipEntry.async("text");
        } else if (name.endsWith(".js")) {
          type = "application/javascript";
          content = await zipEntry.async("text");
        } else {
          const bytes = await zipEntry.async("uint8array");
          const ext = name.split(".").pop() || "png";
          type = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : ext === "mp3" ? "audio/mpeg" : "application/octet-stream";
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          content = `data:${type};base64,${btoa(binary)}`;
        }
        
        files.push({
          id: crypto.randomUUID(),
          name,
          type,
          content
        });
      })();
      promises.push(promise);
    });
    
    await Promise.all(promises);
    return files;
  };

  const parseFiles = async (fileList: FileList): Promise<WidgetFile[]> => {
    const files: WidgetFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const name = file.name;
      let type = "text/plain";
      let content = "";
      
      if (name.endsWith(".html")) {
        type = "text/html";
        content = await file.text();
      } else if (name.endsWith(".css")) {
        type = "text/css";
        content = await file.text();
      } else if (name.endsWith(".js")) {
        type = "application/javascript";
        content = await file.text();
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = name.split(".").pop() || "png";
        type = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : ext === "mp3" ? "audio/mpeg" : "application/octet-stream";
        let binary = "";
        for (let k = 0; k < bytes.byteLength; k++) {
          binary += String.fromCharCode(bytes[k]);
        }
        content = `data:${type};base64,${btoa(binary)}`;
      }
      
      files.push({
        id: crypto.randomUUID(),
        name,
        type,
        content
      });
    }
    return files;
  };

  const onUpload = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    
    let widgetFiles: WidgetFile[] = [];
    let widgetName = "Web Widget";
    
    const firstFile = filesList[0];
    if (filesList.length === 1 && firstFile.name.endsWith(".zip")) {
      widgetFiles = await parseZip(firstFile);
      widgetName = firstFile.name.replace(/\.zip$/i, "") + " Widget";
    } else {
      widgetFiles = await parseFiles(filesList);
      const mainHtml = widgetFiles.find(f => f.name.endsWith(".html"));
      widgetName = mainHtml ? mainHtml.name.replace(/\.html$/i, "") : "Custom Widget";
    }
    
    if (widgetFiles.length === 0) return;
    
    // Compile on-the-fly
    const compiledUrl = compileWidgetCode(widgetFiles);
    
    // Create Media Asset
    const media: MediaAsset = {
      id: uid(),
      name: widgetName,
      type: "widget",
      dataUrl: compiledUrl,
      categoryId: "static-assets",
      schedule: {
        spawnMode: "static",
        hourlyLimit: 0,
        dailyLimit: 0,
        weeklyLimit: 0,
        season: "any",
        dateStart: "",
        dateEnd: "",
        hourStart: 0,
        hourEnd: 24,
        enabled: true
      },
      inLibrary: false,
      files: widgetFiles
    } as any;
    
    addMedia(media);
    const layer = data.layers.find(l => l.id === "layer-mid") || data.layers[0];
    const asset = newCanvasAsset(media.id, layer.id, media);
    useStore.getState().addAsset(asset);
    useStore.getState().select("asset", asset.id);
  };

  const handleReplaceFile = (fileId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      const file = files[0];
      
      let type = "text/plain";
      let content = "";
      if (file.name.endsWith(".html")) {
        type = "text/html";
        content = await file.text();
      } else if (file.name.endsWith(".css")) {
        type = "text/css";
        content = await file.text();
      } else if (file.name.endsWith(".js")) {
        type = "application/javascript";
        content = await file.text();
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = file.name.split(".").pop() || "png";
        type = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : ext === "mp3" ? "audio/mpeg" : "application/octet-stream";
        let binary = "";
        for (let k = 0; k < bytes.byteLength; k++) {
          binary += String.fromCharCode(bytes[k]);
        }
        content = `data:${type};base64,${btoa(binary)}`;
      }

      useStore.getState().update((d) => {
        const m = d.media.find(x => x.id === activeMedia!.id);
        if (m && m.files) {
          m.files = m.files.map(f => {
            if (f.id === fileId) {
              return { ...f, name: file.name, type, content };
            }
            return f;
          });
          m.dataUrl = compileWidgetCode(m.files);
        }
      });
      window.dispatchEvent(new CustomEvent("liveobs-force-runtime-rebuild"));
    };
    input.click();
  };

  const handleDeleteFile = (fileId: string) => {
    useStore.getState().update((d) => {
      const m = d.media.find(x => x.id === activeMedia!.id);
      if (m && m.files) {
        m.files = m.files.filter(f => f.id !== fileId);
        m.dataUrl = compileWidgetCode(m.files);
      }
    });
    window.dispatchEvent(new CustomEvent("liveobs-force-runtime-rebuild"));
  };

  const handleAddFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      const file = files[0];
      
      let type = "text/plain";
      let content = "";
      if (file.name.endsWith(".html")) {
        type = "text/html";
        content = await file.text();
      } else if (file.name.endsWith(".css")) {
        type = "text/css";
        content = await file.text();
      } else if (file.name.endsWith(".js")) {
        type = "application/javascript";
        content = await file.text();
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = file.name.split(".").pop() || "png";
        type = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : ext === "mp3" ? "audio/mpeg" : "application/octet-stream";
        let binary = "";
        for (let k = 0; k < bytes.byteLength; k++) {
          binary += String.fromCharCode(bytes[k]);
        }
        content = `data:${type};base64,${btoa(binary)}`;
      }

      useStore.getState().update((d) => {
        const m = d.media.find(x => x.id === activeMedia!.id);
        if (m) {
          const mFiles = m.files || [];
          m.files = [...mFiles, { id: crypto.randomUUID(), name: file.name, type, content }];
          m.dataUrl = compileWidgetCode(m.files);
        }
      });
      window.dispatchEvent(new CustomEvent("liveobs-force-runtime-rebuild"));
    };
    input.click();
  };

  const handleDeleteWidget = () => {
    if (activeAsset) {
      useStore.getState().removeAsset(activeAsset.id);
      useStore.getState().select(null, null);
    }
  };

  // Find all assets of type widget
  const widgetAssets = data.assets.filter(a => {
    const m = data.media.find(x => x.id === a.mediaId);
    return m?.type === "widget";
  });

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith(".html")) return "📄";
    if (fileName.endsWith(".css")) return "🎨";
    if (fileName.endsWith(".js")) return "⚙️";
    if (fileName.match(/\.(png|jpg|jpeg|svg|gif|webp)$/i)) return "🖼️";
    if (fileName.match(/\.(mp3|wav|ogg)$/i)) return "🎵";
    return "📝";
  };

  return (
    <div className="space-y-3">
      <Panel title="Import HTML Widget">
        <input ref={inputRef} type="file" accept=".html,.css,.js,.zip" multiple hidden onChange={(e) => onUpload(e.target.files)} />
        <Btn variant="primary" className="w-full" onClick={() => inputRef.current?.click()}>
          ⬆ Upload HTML / CSS / JS / ZIP Widget
        </Btn>
        <p className="mt-1 text-[10px] text-slate-500">
          Upload `.html`, `.css`, `.js`, a group of files, or a `.zip` package. It will automatically bundle and render natively on your canvas!
        </p>
      </Panel>

      <Panel title="Placed Widgets">
        {widgetAssets.length === 0 ? (
          <EmptyHint>No custom code widgets placed yet.</EmptyHint>
        ) : (
          <div className="space-y-2">
            {widgetAssets.map((a) => {
              const m = data.media.find(x => x.id === a.mediaId);
              const files = m?.files || [];
              const isGroup = files.length > 1;
              const sel = selId === a.id && selKind === "asset";
              const isExpanded = !!expandedGroups[a.id];

              return (
                <div key={a.id} className={`rounded-md border p-2 transition-all ${sel ? "border-violet-500 bg-violet-500/5" : "border-slate-800 bg-slate-800/30"}`}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => useStore.getState().select("asset", a.id)}
                      className="flex-1 text-left text-xs font-semibold text-slate-200"
                    >
                      🌐 {a.name}
                      <span className="block text-[9px] text-slate-500 font-medium">
                        {isGroup ? `Code Group (${files.length} files)` : "Single File Widget"}
                      </span>
                    </button>
                    {isGroup && (
                      <button
                        onClick={() => setExpandedGroups(prev => ({ ...prev, [a.id]: !prev[a.id] }))}
                        className="rounded px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                      >
                        {isExpanded ? "▲ Hide files" : "▼ Show files"}
                      </button>
                    )}
                  </div>

                  {/* Dropdown list of files */}
                  {isGroup && isExpanded && (
                    <div className="mt-2 pl-2 border-l border-violet-500/20 space-y-1">
                      {files.map((f) => (
                        <div key={f.id} className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-950/20 p-1 rounded">
                          <span className="truncate">{getFileIcon(f.name)} {f.name}</span>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => handleReplaceFile(f.id)} className="text-[9px] text-violet-400 hover:underline">Replace</button>
                            {f.name !== "index.html" && !f.name.endsWith(".html") && (
                              <button onClick={() => handleDeleteFile(f.id)} className="text-[9px] text-rose-400 hover:underline">Delete</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {isWidgetSelected && activeMedia && (
        <Panel title={`Manage Widget: ${activeMedia.name}`}>
          <div className="space-y-2">
            <div className="text-[10px] leading-relaxed text-slate-400">
              <span className="font-semibold block text-slate-300">Widget Type:</span>
              {(activeMedia.files || []).length > 1 ? "Code Group Widget" : "Single File HTML Widget"}
            </div>
            <div className="grid grid-cols-1 gap-1.5 pt-1">
              <Btn onClick={handleAddFile} className="w-full text-xs">
                ➕ Add File to Code Group
              </Btn>
              <Btn variant="danger" onClick={handleDeleteWidget} className="w-full text-xs">
                🗑 Delete Entire Widget from Canvas
              </Btn>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}