import React, { useState } from 'react';
import { generateInvite } from '../api/generateInvite';
import { Copy, Link, UserPlus, Lock, FileUp, Users, X, FileText } from 'lucide-react';
import { MarkdownUploader } from './MarkdownUploader';

type CandidateResult = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  score: string;
  submitted: string;
  notes: string;
};

import type { CurrentUser } from './Header';

interface DashboardProps {
  currentUser: CurrentUser | null;
  onLogin: (user: CurrentUser) => void;
}

export const RecruiterDashboard: React.FC<DashboardProps> = ({ currentUser, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [activeTab, setActiveTab] = useState<'invite' | 'review' | 'upload'>('invite');

  // Link Generator State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Agent');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');

  // Results State
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  // Modal State
  const [viewingCandidate, setViewingCandidate] = useState<CandidateResult | null>(null);

  React.useEffect(() => {
    if (activeTab === 'review') {
      fetchResults();
    }
  }, [activeTab]);

  const fetchResults = async () => {
    setIsLoadingResults(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) return;
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const res = await fetch(`${baseUrl}/results`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data);
      }
    } catch (e) {
      console.error("Failed to load results", e);
    } finally {
      setIsLoadingResults(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'ACG2026$') {
      onLogin({ name: 'Admin', role: 'Recruiter', isRecruiter: true });
    } else {
      alert("Invalid credentials.");
    }
  };

  const handleGenerate = async () => {
    if (!email || !name) {
      alert("Please enter candidate name and email.");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateInvite({ candidateName: name, candidateEmail: email, role });
      setGeneratedLink(result.link);
    } catch (e) {
      alert("Failed to generate link.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    alert("Link copied to clipboard!");
  };

  if (!currentUser?.isRecruiter) {
    return (
      <div className="container animate-fade-in" style={{ marginTop: '4rem' }}>
        <div className="card" style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
          <Lock size={48} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
          <h2>Recruiter Login</h2>
          <form onSubmit={handleLogin} style={{ textAlign: 'left', marginTop: '2rem' }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input type="text" className="form-control" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
              Secure Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container animate-fade-in" style={{ marginTop: '2rem' }}>
      
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
        <button className={`btn ${activeTab === 'invite' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('invite')}>
          <UserPlus size={18} /> Add New Candidate
        </button>
        <button className={`btn ${activeTab === 'review' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('review')}>
          <Users size={18} /> Review Candidate Assessments
        </button>
        <button className={`btn ${activeTab === 'upload' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('upload')}>
          <FileUp size={18} /> Add New Assessment Tracker
        </button>
      </div>

      {activeTab === 'invite' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--primary-color)' }}>
            <UserPlus size={24} />
            Recruiter Link Generator
          </h2>

          <div className="form-group" style={{ marginTop: '2rem' }}>
            <label className="form-label">Candidate Name</label>
            <input 
              type="text" 
              className="form-control" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Candidate Email</label>
            <input 
              type="email" 
              className="form-control" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="candidate@domain.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Candidate Role</label>
            <select 
              className="form-control"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="Agent">Agent</option>
              <option value="Coordinator">Coordinator</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <button 
            className="btn btn-primary" 
            onClick={handleGenerate} 
            disabled={isGenerating || !email || !name}
            style={{ width: '100%', padding: '1rem', marginTop: '1rem' }}
          >
            {isGenerating ? 'Generating...' : 'Generate Secure Assessment Link'}
            {!isGenerating && <Link size={18} />}
          </button>

          {generatedLink && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-color-alt)', border: '1px solid var(--primary-color)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>Success! Tracking link generated:</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  readOnly 
                  className="form-control" 
                  value={generatedLink} 
                  style={{ background: 'var(--bg-color)', color: 'var(--primary-color)' }}
                />
                <button className="btn btn-secondary" onClick={copyToClipboard} title="Copy to clipboard">
                  <Copy size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'review' && (
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>Review Pipeline Analytics</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-color-alt)' }}>
                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Candidate</th>
                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Role</th>
                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Submitted</th>
                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Status</th>
                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>AI Score</th>
                <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingResults ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Loading results from AWS...</td></tr>
              ) : candidates.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No submissions found.</td></tr>
              ) : candidates.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '1rem' }}>
                    <strong>{c.name}</strong><br/>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{c.email}</span>
                  </td>
                  <td style={{ padding: '1rem' }}>{c.role}</td>
                  <td style={{ padding: '1rem' }}>{c.submitted.substring(0, 16).replace('T', ' ')}</td>
                  <td style={{ padding: '1rem' }}>{c.status}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.75rem', 
                      borderRadius: '1rem', 
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      background: c.score === 'Green' ? '#10b981' : c.score === 'Yellow' ? '#f59e0b' : c.score === 'Pending' ? '#6366f1' : '#ef4444',
                      color: 'white'
                    }}>
                      {c.score}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                      onClick={() => setViewingCandidate(c)}
                    >
                      View Package
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'upload' && (
        <div>
          <MarkdownUploader onUpload={() => alert("Assessment uploaded successfully! In production, this saves directly to S3 as the global spec.")} />
        </div>
      )}

      {/* Mock Candidate Detail Modal */}
      {viewingCandidate && (
        <div className="modal-overlay open" onClick={() => setViewingCandidate(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
              <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>Candidate Record</h2>
              <button onClick={() => setViewingCandidate(null)} className="btn btn-secondary" style={{ padding: '0.5rem' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <div>
                <p style={{ margin: '0 0 0.25rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Name</p>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>{viewingCandidate.name}</p>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{viewingCandidate.email}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>AI Grading</p>
                <span style={{ 
                    padding: '0.35rem 1rem', borderRadius: '1rem', fontSize: '0.95rem', fontWeight: 'bold',
                    background: viewingCandidate.score === 'Green' ? '#10b981' : viewingCandidate.score === 'Yellow' ? '#f59e0b' : viewingCandidate.score === 'Pending' ? '#6366f1' : '#ef4444',
                    color: 'white'
                  }}>
                    {viewingCandidate.score === 'Pending' ? 'Pending' : viewingCandidate.score + ' Pass'}
                </span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-color-alt)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color="var(--accent-color)" /> Assessment Notes
              </p>
              <p style={{ margin: 0, fontStyle: 'italic', color: viewingCandidate.notes ? 'var(--text-color)' : 'var(--text-muted)' }}>
                {viewingCandidate.notes || "No additional flags or notes were provided by the candidate."}
              </p>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>* S3 attached files (SpeedTest.png, Notes.txt) are successfully parsed into Perplexity context.</p>
          </div>
        </div>
      )}

    </div>
  );
};
