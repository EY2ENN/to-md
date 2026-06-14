import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import ReactMarkdown from "react-markdown";
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
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const activeJob = jobs.find(j => j.id === activeJobId);

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    let isMounted = true;
    
    async function setupDragDrop() {
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

  async function handleCopyContent() {
    if (activeJob?.resultContent) {
      await navigator.clipboard.writeText(activeJob.resultContent);
    }
  }

  const isProcessing = jobs.some(j => j.status === 'processing');
  const processedCount = jobs.filter(j => j.status === 'success' || j.status === 'error').length;
  
  // Calculate avg time
  const successfulJobs = jobs.filter(j => j.status === 'success' && j.convertTime !== undefined);
  const avgTimeMs = successfulJobs.length > 0 
    ? successfulJobs.reduce((acc, j) => acc + (j.convertTime || 0), 0) / successfulJobs.length 
    : 0;
  const avgTimeStr = avgTimeMs > 0 ? (avgTimeMs / 1000).toFixed(1) + 's' : '--';

  return (
    <div className="bento">
      {/* Left Column: Dropzone & Queue */}
      <div className="card dropzone" style={{ height: '120px' }} onClick={handleAddFiles}>
        <div>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>+</div>
          <div>DROP FILES HERE</div>
        </div>
      </div>

      {/* Right Column: Stats */}
      <div className="stats">
        <div className="card">
          <div className="card-meta">Sys.Status</div>
          <div className="title">Engine</div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto' }}>
            <div className={`led ${isProcessing ? 'orange' : 'gray'}`}></div>
            <span>{isProcessing ? `PROCESSING (${processedCount}/${jobs.length})` : 'IDLE'}</span>
          </div>
        </div>
        <div className="card">
          <div className="card-meta">Performance</div>
          <div className="title">Avg Time</div>
          <div className="metric">{avgTimeStr}</div>
        </div>
        <div className="card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0' }}>
           <div className="clock">U2MD</div>
        </div>
      </div>

      <div className="card queue">
        <div className="card-meta">Queue</div>
        <h2 className="title">Tasks</h2>
        
        {jobs.length === 0 ? (
          <div className="empty-state">No tasks in queue.</div>
        ) : (
          jobs.map(job => (
            <div 
              key={job.id} 
              className={`list-item ${job.id === activeJobId ? 'active' : ''}`}
              onClick={() => setActiveJobId(job.id)}
            >
              <div className={`led ${job.status === 'success' ? 'green' : job.status === 'error' ? 'red' : job.status === 'processing' ? 'orange' : 'gray'}`}></div>
              <div className="file-name">{job.fileName}</div>
              <div className="file-tag">{job.fileExt}</div>
            </div>
          ))
        )}

        <button 
          className="btn" 
          style={{ width: '100%', marginTop: 'auto', paddingTop: '8px', paddingBottom: '8px' }} 
          onClick={handleConvertAll}
          disabled={!jobs.some(j => j.status === 'pending' || j.status === 'error') || isProcessing}
        >
          CONVERT ALL
        </button>
        {isProcessing && <div className="shimmer"></div>}
      </div>

      {/* Right Column: Preview */}
      <div className="card preview">
        <div className="card-meta">Output</div>
        
        {activeJob ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h2 className="title">{activeJob.fileName}.md</h2>
              <div>
                <button className="btn" onClick={handleCopyContent} disabled={!activeJob.resultContent}>COPY</button>
                <button className="btn" style={{ marginLeft: '8px' }}>OPEN DIR</button>
              </div>
            </div>
            
            <div className="markdown-content" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
              {activeJob.status === 'processing' && <p>Processing...</p>}
              {activeJob.status === 'error' && <p style={{ color: 'var(--accent-red)' }}>Error: {activeJob.errorMessage}</p>}
              {activeJob.status === 'success' && activeJob.resultContent && (
                <div className="markdown-body">
                  <ReactMarkdown>{activeJob.resultContent}</ReactMarkdown>
                </div>
              )}
              {activeJob.status === 'pending' && <p>Waiting in queue...</p>}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>Select a file to preview output.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
