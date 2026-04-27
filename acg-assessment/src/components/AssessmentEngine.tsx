import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Clock, AlertTriangle, CheckCircle2, ChevronRight, FileUp, X } from 'lucide-react';
import { submitAssessment } from '../api/submitAssessment';
import { uploadFile } from '../api/uploadFile';
import type { CurrentUser } from './Header';

interface AssessmentEngineProps {
  markdownContent: string;
  onCandidateStart: (user: CurrentUser) => void;
}

type StepUpload = { key: string; filename: string };

const SCREENSHOT_TAG = /\[\s*screenshot\s+required\s*\]/i;

export const AssessmentEngine: React.FC<AssessmentEngineProps> = ({ markdownContent, onCandidateStart }) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [candidate, setCandidate] = useState({ name: '', email: '', role: 'Agent' });
  const [folderName, setFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [stepUploads, setStepUploads] = useState<Record<string, StepUpload[]>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [startTime, setStartTime] = useState<Date | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [issueNotes, setIssueNotes] = useState("");

  const [currentStep, setCurrentStep] = useState(0);
  const [analyticsLog, setAnalyticsLog] = useState<Record<string, number>>({});
  const [stepEnterTime, setStepEnterTime] = useState<number>(0);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillEmail = params.get('email');
    const prefillName = params.get('name');
    const inviteId = params.get('invite');
    const folder = params.get('folder');

    if (inviteId) {
      const name = prefillName ? decodeURIComponent(prefillName) : '';
      setCandidate({
        name,
        email: prefillEmail ? decodeURIComponent(prefillEmail) : '',
        role: 'Agent'
      });
      if (folder) {
        setFolderName(decodeURIComponent(folder));
      }

      setStartTime(new Date());
      setStepEnterTime(Date.now());
      setHasStarted(true);
      onCandidateStart({ name: name || 'Candidate', role: 'Agent', isRecruiter: false });
    }
  }, [onCandidateStart]);

  const taskChunks = markdownContent
    .split(/\r?\n\s*(?:\*\*\*|---|___)\s*\r?\n/)
    .filter(chunk => chunk.trim() !== '');

  const stepRequiresScreenshot = (idx: number) => {
    const chunk = taskChunks[idx];
    return chunk ? SCREENSHOT_TAG.test(chunk) : false;
  };

  const stepKey = (idx: number) => `step_${idx}`;

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

    setStepEnterTime(Date.now());
    setCurrentStep(prev => prev + 1);
  };

  const handleSubmit = async () => {
    if (!hasStarted || !startTime) return;
    setIsSubmitting(true);

    const timeSpent = (Date.now() - stepEnterTime) / 1000;
    const finalLog = { ...analyticsLog, 'Final Review': timeSpent };

    const allUploadKeys = Object.values(stepUploads).flat().map(u => u.key);
    const stepUploadKeys = Object.fromEntries(
      Object.entries(stepUploads).map(([k, v]) => [k, v.map(u => u.filename)])
    );

    try {
      await submitAssessment({
        candidate,
        folderName,
        uploadKeys: allUploadKeys,
        stepUploads: stepUploadKeys,
        assessmentStartUtc: startTime.toISOString(),
        completedSteps,
        issueNotes,
        totalTasksAvailable: taskChunks.length - 1,
        inviteId: new URLSearchParams(window.location.search).get('invite') || null,
        analyticsLog: finalLog
      });
      setIsSuccess(true);
    } catch (e) {
      alert("There was an error submitting your assessment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStepFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, stepIdx: number) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!folderName) {
      setUploadError("Cannot upload — missing candidate session. Reopen your invite link.");
      return;
    }

    const file = e.target.files[0];
    setUploadingFor(stepKey(stepIdx));
    setUploadError(null);

    try {
      const key = await uploadFile(file, folderName, stepKey(stepIdx));
      setStepUploads(prev => ({
        ...prev,
        [stepKey(stepIdx)]: [...(prev[stepKey(stepIdx)] || []), { key, filename: file.name }]
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingFor(null);
      e.target.value = '';
    }
  };

  const removeStepUpload = (stepIdx: number, fileKey: string) => {
    setStepUploads(prev => ({
      ...prev,
      [stepKey(stepIdx)]: (prev[stepKey(stepIdx)] || []).filter(u => u.key !== fileKey)
    }));
  };

  const toggleStep = (index: number) => {
    setCompletedSteps(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const canAdvance = (idx: number) => {
    if (idx === 0) return true;
    if (!completedSteps[idx]) return false;
    if (stepRequiresScreenshot(idx) && (stepUploads[stepKey(idx)] || []).length === 0) return false;
    return true;
  };

  if (isSuccess) {
    return (
      <div className="container animate-fade-in" style={{ textAlign: 'center', marginTop: '4rem' }}>
        <CheckCircle2 size={64} color="var(--success-color)" style={{ marginBottom: '1rem' }} />
        <h1>Assessment Submitted Successfully!</h1>
        <p>Thank you for completing the technical assessment. You may now close this window.</p>
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

  const currentUploads = stepUploads[stepKey(currentStep)] || [];
  const requiresScreenshot = stepRequiresScreenshot(currentStep);

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

                {requiresScreenshot && (
                  <div style={{ background: 'var(--bg-color-alt)', padding: '1rem', borderRadius: 'var(--radius-md)', marginTop: '1rem', border: '1px solid var(--border-color)' }}>
                    <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
                      Screenshot required for this step
                    </p>
                    <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem' }}>
                      Attach a screenshot or supporting file showing the result of this step. You will not be able to advance until at least one file is attached.
                    </p>

                    <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileUp size={18} />
                      {uploadingFor === stepKey(currentStep) ? "Uploading..." : "Attach screenshot"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,application/pdf,.txt,.md,.csv,.json,.log"
                        onChange={(e) => handleStepFileUpload(e, currentStep)}
                        disabled={uploadingFor === stepKey(currentStep)}
                        style={{ display: 'none' }}
                      />
                    </label>

                    {uploadError && (
                      <p style={{ marginTop: '0.5rem', color: 'var(--error-color)', fontSize: '0.85rem' }}>
                        {uploadError}
                      </p>
                    )}

                    {currentUploads.length > 0 && (
                      <ul style={{ paddingLeft: '1.25rem', margin: '0.75rem 0 0 0', fontSize: '0.9rem' }}>
                        {currentUploads.map(u => (
                          <li key={u.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{u.filename}</span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                              onClick={() => removeStepUpload(currentStep, u.key)}
                            >
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleNextStep}
              disabled={!canAdvance(currentStep)}
              style={{ marginTop: '2rem', width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
            >
              Next Step <ChevronRight size={20} />
            </button>
            {!canAdvance(currentStep) && currentStep > 0 && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                {!completedSteps[currentStep]
                  ? 'Mark this task complete to continue.'
                  : 'Attach the required screenshot to continue.'}
              </p>
            )}
          </div>
        ) : (
          <div className="card animate-fade-in" style={{ marginBottom: '4rem', borderColor: 'var(--accent-color)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>Evidence summary</p>
              {Object.keys(stepUploads).length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>No screenshots uploaded.</p>
              ) : (
                <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.9rem' }}>
                  {Object.entries(stepUploads).map(([k, files]) => (
                    <li key={k}>
                      <strong>{k}</strong>: {files.map(f => f.filename).join(', ')}
                    </li>
                  ))}
                </ul>
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
    </div>
  );
};
