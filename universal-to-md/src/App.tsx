import { useState, useEffect, type MouseEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type JobStatus = "pending" | "processing" | "success" | "error";

interface ConversionJob {
  id: string;
  sourcePath: string;
  fileName: string;
  fileExt: string;
  status: JobStatus;
  progress: number;
  resultContent?: string;
  errorMessage?: string;
  convertTime?: number;
}

function App() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    let isMounted = true;
    
    async function setupDragDrop() {
      if (!isTauri()) return;

      const webview = getCurrentWebview();
      const unlisten = await webview.onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          const paths = event.payload.paths;
          setJobs(prev => {
            const existingPaths = new Set(prev.map(j => j.sourcePath));
            const newPaths = paths.filter(p => !existingPaths.has(p));
            
            const newJobs = newPaths.map(p => {
              const fileName = p.split(/[/\\]/).pop() || 'Unknown';
              const fileExt = fileName.split('.').pop()?.toUpperCase() || 'FILE';
              return {
                id: Math.random().toString(36).substring(7),
                sourcePath: p,
                fileName,
                fileExt,
                status: "pending" as JobStatus,
                progress: 0
              };
            });
            return [...prev, ...newJobs];
          });
        }
      });
      
      if (!isMounted) {
        unlisten();
      } else {
        unlistenFn = unlisten;
      }
    }

    setupDragDrop();

    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  async function handleAddFiles() {
    const selected = await open({
      multiple: true,
      filters: [{
        name: 'Documents',
        extensions: ['docx', 'epub', 'txt', 'md', 'pdf']
      }]
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      
      setJobs(prev => {
        const existingPaths = new Set(prev.map(j => j.sourcePath));
        const newPaths = (paths as string[]).filter(p => !existingPaths.has(p));
        
        const newJobs = newPaths.map(pathStr => {
          const fileName = pathStr.split(/[/\\]/).pop() || 'Unknown';
          const fileExt = fileName.split('.').pop()?.toUpperCase() || 'FILE';
          return {
            id: Math.random().toString(36).substring(7),
            sourcePath: pathStr,
            fileName,
            fileExt,
            status: "pending" as JobStatus,
            progress: 0
          };
        });
        return [...prev, ...newJobs];
      });
    }
  }

  async function handleConvertAll() {
    const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'error');
    
    for (const job of pendingJobs) {
      setJobs(prev => prev.map(j => 
        j.id === job.id ? { ...j, status: "processing" } : j
      ));

      const startTime = performance.now();
      try {
        const mdContent = await invoke<string>("convert_file", { filePath: job.sourcePath });
        const endTime = performance.now();
        setJobs(prev => prev.map(j => 
          j.id === job.id ? { ...j, status: "success", resultContent: mdContent, convertTime: (endTime - startTime) } : j
        ));
      } catch (err: any) {
        setJobs(prev => prev.map(j => 
          j.id === job.id ? { ...j, status: "error", errorMessage: err.toString() } : j
        ));
      }
    }
  }

  async function handleWindowDrag(event: MouseEvent<HTMLElement>) {
    if (!isTauri()) return;
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='button'], [data-no-window-drag='true']")) {
      return;
    }

    try {
      await getCurrentWindow().startDragging();
    } catch {
      // Running in a plain browser preview has no native window to drag.
    }
  }

  const isProcessing = jobs.some(j => j.status === 'processing');

  return (
    <div className="app-shell" onMouseDown={handleWindowDrag}>
      <section className="dropzone">
        <div className="dropzone-inner" onClick={handleAddFiles} data-no-window-drag="true">
          <div className="dropzone-plus">+</div>
          <div>DROP FILES HERE</div>
        </div>
      </section>

      <section className="queue-panel">
        <div className="section-label">Tasks</div>
        
        <div className="queue-list">
          {jobs.length === 0 ? (
            <div className="empty-state">No tasks in queue.</div>
          ) : (
            jobs.map(job => (
              <div className="list-item" key={job.id} data-no-window-drag="true">
                <div className={`led ${job.status === 'success' ? 'green' : job.status === 'error' ? 'red' : job.status === 'processing' ? 'orange' : 'gray'}`} />
                <div className="file-name">{job.fileName}</div>
                <div className="file-tag">{job.fileExt}</div>
              </div>
            ))
          )}
        </div>

        <button 
          className="btn" 
          type="button"
          onClick={handleConvertAll}
          disabled={!jobs.some(j => j.status === 'pending' || j.status === 'error') || isProcessing}
        >
          Be nice to AI
        </button>
        {isProcessing && <div className="shimmer"></div>}
      </section>
    </div>
  );
}

export default App;
