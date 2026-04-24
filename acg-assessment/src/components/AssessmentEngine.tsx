import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Clock, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { submitAssessment } from '../api/submitAssessment';
import type { CurrentUser } from './Header';

interface AssessmentEngineProps {
  markdownContent: string;
  onCandidateStart: (user: CurrentUser) => void;
}

export const AssessmentEngine: React.FC<AssessmentEngineProps> = ({ markdownContent, onCandidateStart }) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [candidate, setCandidate] = useState({ name: '', email: '', role: 'Agent' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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
    
    if (inviteId) {
      const name = prefillName ? decodeURIComponent(prefillName) : '';
      setCandidate({ 
        name: name, 
        email: prefillEmail ? decodeURIComponent(prefillEmail) : '', 
        role: 'Agent' 
      });
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
    
    setStepEnterTime(Date.now());
    setCurrentStep(prev => prev + 1);
  };

  const handleSubmit = async () => {
    if (!hasStarted || !startTime) return;
    setIsSubmitting(true);
    
    const timeSpent = (Date.now() - stepEnterTime) / 1000;
    const finalLog = { ...analyticsLog, 'Final Review': timeSpent };
    
    try {
      await submitAssessment({
        candidate,
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
