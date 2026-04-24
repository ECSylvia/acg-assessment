import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Clock, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { submitAssessment } from '../api/submitAssessment';
import { uploadFile } from '../api/uploadFile';
import { FileUp } from 'lucide-react';
import type { CurrentUser } from './Header';

// Global debug logger array
const debugLogs: string[] = [];
const addDebugLog = (msg: string) => {
  const time = new Date().toLocaleTimeString();
  debugLogs.push(`[${time}] ${msg}`);
  // Dispatch custom event to update debug tray
  window.dispatchEvent(new Event('debug-log'));
};

interface AssessmentEngineProps {
  markdownContent: string;
  onCandidateStart: (user: CurrentUser) => void;
}

export const AssessmentEngine: React.FC<AssessmentEngineProps> = ({ markdownContent, onCandidateStart }) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [candidate, setCandidate] = useState({ name: '', email: '', role: 'Agent' });
  const [folderName, setFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [uploadKeys, setUploadKeys] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);

  React.useEffect(() => {
    const handleLog = () => setLogs([...debugLogs]);
    window.addEventListener('debug-log', handleLog);
    return () => window.removeEventListener('debug-log', handleLog);
  }, []);

  // States for dynamic tracking
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [issueNotes, setIssueNotes] = useState("");

  // Wizard and Analytics State
  const [currentStep, setCurrentStep] = useState(0);
  const [analyticsLog, setAnalyticsLog] = useState<Record<string, number>>({});
  const [stepEnterTime, setStepEnterTime] = useState<number>(0);

  // Pre-fill from Tracking Link and auto-start
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillEmail = params.get('email');
    const prefillName = params.get('name');
    const inviteId = params.get('invite');
    const folder = params.get('folder');
    
    if (inviteId) {
      addDebugLog("Detected invite ID from URL: " + inviteId);
      const name = prefillName ? decodeURIComponent(prefillName) : '';
      setCandidate({ 
        name: name, 
        email: prefillEmail ? decodeURIComponent(prefillEmail) : '', 
        role: 'Agent' 
      });
      if (folder) {
        addDebugLog("Detected Candidate Folder: " + decodeURIComponent(folder));
        setFolderName(decodeURIComponent(folder));
      } else {
        addDebugLog("WARNING: Candidate Folder ID missing from URL");
      }
      
      setStartTime(new Date());
      setStepEnterTime(Date.now());
      setHasStarted(true);
      onCandidateStart({ name: name || 'Candidate', role: 'Agent', isRecruiter: false });
    }
  }, [onCandidateStart]);

  // Split markdown by horizontal rules to get chunks.
  const taskChunks = markdownContent
    .split(/\r?\n\s*(?:\*\*\*|---|___)\s*\r?\n/)
    .filter(chunk => chunk.trim() !== '');

  const handleStart = () => {
    if (!candidate.name || !candidate.email) {
      alert("Please enter your name and email to begin.");
      return;
    }
    setHasStarted(true);
    setStartTime(new Date());
    setStepEnterTime(Date.now());
    onCandidateStart({ name: candidate.name, role: candidate.role, isRecruiter: false });
  };

  const handleNextStep = () => {
    const timeSpent = (Date.now() - stepEnterTime) / 1000;
    const stepName = currentStep === 0 ? 'Intro' : `Task ${currentStep}`;
    setAnalyticsLog(prev => ({ ...prev, [stepName]: (prev[stepName] || 0) + timeSpent }));
    addDebugLog(`Completed ${stepName} in ${timeSpent.toFixed(1)}s`);
    
    setStepEnterTime(Date.now());
    setCurrentStep(prev => prev + 1);
  };

  const handleSubmit = async () => {
    if (!hasStarted || !startTime) return;
    setIsSubmitting(true);
    addDebugLog("Starting assessment submission...");
    
    const timeSpent = (Date.now() - stepEnterTime) / 1000;
    const finalLog = { ...analyticsLog, 'Final Review': timeSpent };
    
    try {
      await submitAssessment({
        candidate,
        folderName,
        uploadKeys,
        assessmentStartUtc: startTime.toISOString(),
        completedSteps,
        issueNotes,
        totalTasksAvailable: taskChunks.length - 1,
        inviteId: new URLSearchParams(window.location.search).get('invite') || null,
        analyticsLog: finalLog
      });
      addDebugLog("API Submission SUCCESS. Payload processed.");
      setIsSuccess(true);
    } catch (e) {
      addDebugLog("API Submission FAILED: " + e);
      alert("There was an error submitting your assessment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!folderName) {
      addDebugLog("ERROR: Cannot upload without folderName");
      alert("Error: Missing Candidate Folder ID. Cannot upload.");
      return;
    }
    
    const file = e.target.files[0];
    setUploadingFiles(true);
    addDebugLog(`Starting upload for ${file.name}...`);
    try {
      const key = await uploadFile(file, folderName);
      addDebugLog(`Upload SUCCESS. Key: ${key}`);
      setUploadKeys(prev => [...prev, key]);
    } catch (err) {
      addDebugLog(`Upload FAILED: ${err}`);
      alert("Failed to upload file. Please try again.");
      console.error(err);
    } finally {
      setUploadingFiles(false);
      e.target.value = ''; // reset input
    }
  };

  const toggleStep = (index: number) => {
    setCompletedSteps(prev => ({ ...prev, [index]: !prev[index] }));
  };

  if (isSuccess) {
    return (
      <div className="container animate-fade-in" style={{ textAlign: 'center', marginTop: '4rem' }}>
        <CheckCircle2 size={64} color="var(--success-color)" style={{ marginBottom: '1rem' }} />
        <h1>Assessment Submitted Successfully!</h1>
        <p>Thank you for completing the technical assessment. You may now close this window and please remember to send your final email as requested in the tasks.</p>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="container animate-fade-in">
        <div className="card" style={{ maxWidth: '600px', margin: '4rem auto' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Candidate Identification</h2>
          
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input 
              type="text" 
              className="form-control" 
              value={candidate.name}
              onChange={e => setCandidate({ ...candidate, name: e.target.value })}
              placeholder="Jane Doe"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="form-control" 
              value={candidate.email}
              onChange={e => setCandidate({ ...candidate, email: e.target.value })}
              placeholder="jane.doe@example.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Role</label>
            <select 
              className="form-control"
              value={candidate.role}
              onChange={e => setCandidate({ ...candidate, role: e.target.value })}
            >
              <option value="Agent">Agent</option>
              <option value="Coordinator">Coordinator</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', marginTop: '1rem' }}
            onClick={handleStart}
          >
            Start Assessment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1rem', background: 'var(--glass-bg)', borderRadius: 'var(--radius-lg)' }}>
        <div>
          <strong>Progress:</strong> Step {currentStep + 1} of {taskChunks.length + 1}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)' }}>
          <Clock size={18} />
          <strong>Started:</strong> {startTime?.toLocaleTimeString()}
        </div>
      </div>

      <div className="tasks-container">
        {currentStep < taskChunks.length ? (
          <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
            <div className="markdown-body">
              <ReactMarkdown>{taskChunks[currentStep]}</ReactMarkdown>
            </div>
            
            {currentStep > 0 && (
              <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={!!completedSteps[currentStep]} 
                    onChange={() => toggleStep(currentStep)} 
                  />
                  <span className="checkmark"></span>
                  <span style={{ fontWeight: 500 }}>I have completed this task.</span>
                </label>
              </div>
            )}

            <button 
              className="btn btn-primary" 
              onClick={handleNextStep}
              disabled={currentStep > 0 && !completedSteps[currentStep]}
              style={{ marginTop: '2rem', width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
            >
              Next Step <ChevronRight size={20} />
            </button>
          </div>
        ) : (
          <div className="card animate-fade-in" style={{ marginBottom: '4rem', borderColor: 'var(--accent-color)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
              <AlertTriangle size={24} color="var(--accent-color)" />
              Final Review & Submit
            </h3>
            <p>If you encountered any issues while performing these tasks, please describe them lightly below.</p>
            
            <textarea 
              className="form-control" 
              rows={4}
              value={issueNotes}
              onChange={e => setIssueNotes(e.target.value)}
              placeholder="I noticed that..."
              style={{ marginBottom: '1.5rem' }}
            ></textarea>

            <div style={{ background: 'var(--bg-color-alt)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>Attach Evidence (Screenshots, Logs)</p>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileUp size={18} />
                  {uploadingFiles ? "Uploading..." : "Select File"}
                  <input type="file" onChange={handleFileUpload} disabled={uploadingFiles} style={{ display: 'none' }} />
                </label>
              </div>

              {uploadKeys.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <ul style={{ paddingLeft: '1.5rem', margin: 0, fontSize: '0.9rem' }}>
                    {uploadKeys.map((key, i) => (
                      <li key={i}>{key.split('/').pop()}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button 
              className="btn btn-primary" 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              style={{ fontSize: '1.1rem', padding: '1rem 2rem', width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Assessment Report'}
              {!isSubmitting && <Send size={18} />}
            </button>
          </div>
        )}
      </div>

      {/* Floating Debug Log */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '350px',
        height: '250px',
        background: 'rgba(0,0,0,0.85)',
        color: '#00ff00',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        padding: '1rem',
        borderRadius: '8px',
        overflowY: 'auto',
        border: '1px solid #333',
        zIndex: 9999,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
      }}>
        <h4 style={{ color: 'white', marginTop: 0, marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '0.25rem' }}>Engine Diagnostics Log</h4>
        {logs.map((l, i) => <div key={i} style={{ marginBottom: '4px' }}>{l}</div>)}
        {logs.length === 0 && <div style={{ color: '#888' }}>Awaiting events...</div>}
      </div>
    </div>
  );
};
