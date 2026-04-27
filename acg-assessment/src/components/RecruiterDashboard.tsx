import React, { useState } from 'react';
import { generateInvite } from '../api/generateInvite';
import { Copy, Link, UserPlus, Lock, FileUp, Users, X, FileText, ListChecks, ShieldCheck, Trash2 } from 'lucide-react';
import { MarkdownUploader } from './MarkdownUploader';
import { adminFetch, setAdminToken, getAdminToken } from '../api/adminClient';
import { Activity, Clock, Globe } from 'lucide-react';
import type { CurrentUser } from './Header';

type CandidateResult = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  score: string;
  submitted: string;
  notes: string;
  analytics?: {
    ipAddress?: string;
    userAgent?: string;
    timeSpentPerStep?: Record<string, number>;
    totalTimeMs?: number;
  };
  uploadLinks?: { filename: string, url: string }[];
  stepUploads?: Record<string, string[]>;
};

type ActivityEntry = {
  id: string;
  timestamp: string;
  type: string;
  actor: string;
  message: string;
  meta?: Record<string, unknown>;
};

type RecruiterUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAtUtc: string;
  createdBy: string;
  accessToken?: string;
};

interface DashboardProps {
  currentUser: CurrentUser | null;
  onLogin: (user: CurrentUser) => void;
}

type Tab = 'invite' | 'review' | 'upload' | 'activity' | 'users';

export const RecruiterDashboard: React.FC<DashboardProps> = ({ currentUser, onLogin }) => {
  const [adminPassword, setAdminPassword] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('invite');

  // Invite state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Agent');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Results state
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  // Activity log state
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<RecruiterUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('recruiter');
  const [creatingUser, setCreatingUser] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [lastCreatedToken, setLastCreatedToken] = useState<string | null>(null);

  // Modal state
  const [viewingCandidate, setViewingCandidate] = useState<CandidateResult | null>(null);

  React.useEffect(() => {
    if (!currentUser?.isRecruiter) return;
    if (activeTab === 'review') fetchResults();
    if (activeTab === 'activity') fetchActivity();
    if (activeTab === 'users') fetchUsers();
  }, [activeTab, currentUser?.isRecruiter]);

  const fetchResults = async () => {
    setIsLoadingResults(true);
    setResultsError(null);
    try {
      const res = await adminFetch('/results');
      if (res.status === 401) {
        setResultsError('Session expired. Please log out and log in again.');
        return;
      }
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setCandidates(data);
    } catch (e) {
      setResultsError('Failed to load results.');
    } finally {
      setIsLoadingResults(false);
    }
  };

  const fetchActivity = async () => {
    setIsLoadingActivity(true);
    setActivityError(null);
    try {
      const res = await adminFetch('/activity-log');
      if (res.status === 401) {
        setActivityError('Session expired. Please log out and log in again.');
        return;
      }
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setActivity(data);
    } catch (e) {
      setActivityError('Failed to load activity log.');
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    setUsersError(null);
    try {
      const res = await adminFetch('/users');
      if (res.status === 401) {
        setUsersError('Session expired.');
        return;
      }
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      setUsersError('Failed to load users.');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Admin auth: the password the user types is also used as the bearer token
    // sent to the API. The API enforces the actual ADMIN_API_TOKEN check, so
    // there is no client-side hard-coded credential to bypass.
    if (!adminPassword.trim()) {
      alert('Please enter the admin token.');
      return;
    }
    setAdminToken(adminPassword.trim());
    onLogin({ name: 'Admin', role: 'Recruiter', isRecruiter: true });
    setAdminPassword('');
  };

  const handleGenerate = async () => {
    if (!email || !name) {
      alert('Please enter candidate name and email.');
      return;
    }
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateInvite({ candidateName: name, candidateEmail: email, role, recruiter: currentUser?.name || 'admin' });
      setGeneratedLink(result.link);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Failed to generate link.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserName) {
      setUsersError('Name and email required.');
      return;
    }
    setCreatingUser(true);
    setUsersError(null);
    setLastCreatedToken(null);
    try {
      const res = await adminFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ name: newUserName, email: newUserEmail, role: newUserRole })
      });
      if (!res.ok) throw new Error(`Create failed: ${res.statusText}`);
      const created: RecruiterUser = await res.json();
      setLastCreatedToken(created.accessToken || null);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('recruiter');
      fetchUsers();
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Failed to create user.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm(`Remove recruiter ${id}?`)) return;
    try {
      const res = await adminFetch(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.statusText);
      fetchUsers();
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Failed to delete user.');
    }
  };

  if (!currentUser?.isRecruiter) {
    return (
      <div className="container animate-fade-in" style={{ marginTop: '4rem' }}>
        <div className="card" style={{ maxWidth: '420px', margin: '0 auto', textAlign: 'center' }}>
          <Lock size={48} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
          <h2>Recruiter Login</h2>
          <p style={{ fontSize: '0.9rem' }}>
            Enter the admin access token issued to you. The token is verified server-side.
          </p>
          <form onSubmit={handleLogin} style={{ textAlign: 'left', marginTop: '2rem' }}>
            <div className="form-group">
              <label className="form-label">Admin Access Token</label>
              <input
                type="password"
                className="form-control"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
              <ShieldCheck size={18} /> Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'invite', label: 'Add Candidate', icon: <UserPlus size={18} /> },
    { id: 'review', label: 'Review Submissions', icon: <Users size={18} /> },
    { id: 'activity', label: 'Activity Log', icon: <ListChecks size={18} /> },
    { id: 'users', label: 'Recruiter Access', icon: <ShieldCheck size={18} /> },
    { id: 'upload', label: 'Assessment Spec', icon: <FileUp size={18} /> },
  ];

  return (
    <div className="container animate-fade-in" style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'invite' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <UserPlus size={24} /> Recruiter Link Generator
          </h2>

          <div className="form-group">
            <label className="form-label">Candidate Name</label>
            <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
          </div>

          <div className="form-group">
            <label className="form-label">Candidate Email</label>
            <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} placeholder="candidate@domain.com" />
          </div>

          <div className="form-group">
            <label className="form-label">Candidate Role</label>
            <select className="form-control" value={role} onChange={e => setRole(e.target.value)}>
              <option value="Agent">Agent</option>
              <option value="Coordinator">Coordinator</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <button className="btn btn-primary" onClick={handleGenerate} disabled={isGenerating || !email || !name} style={{ width: '100%', padding: '1rem', marginTop: '1rem' }}>
            {isGenerating ? 'Generating...' : 'Generate Secure Assessment Link'}
            {!isGenerating && <Link size={18} />}
          </button>

          {generateError && <p style={{ marginTop: '0.75rem', color: 'var(--error-color)' }}>{generateError}</p>}

          {generatedLink && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-color-alt)', border: '1px solid var(--primary-color)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>Tracking link generated. Share with the candidate:</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input readOnly className="form-control" value={generatedLink} />
                <button className="btn btn-secondary" onClick={() => copyToClipboard(generatedLink)} title="Copy">
                  <Copy size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'review' && (
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem' }}>Review Pipeline Analytics</h2>
          {resultsError && <p style={{ color: 'var(--error-color)' }}>{resultsError}</p>}
          <div style={{ overflowX: 'auto' }}>
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
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>
                      <strong>{c.name}</strong><br />
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
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListChecks size={22} /> Admin Activity Log
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Recent invites, submissions and recruiter changes recorded by the platform. Replaces the previous SES email notifications.
          </p>
          {activityError && <p style={{ color: 'var(--error-color)' }}>{activityError}</p>}
          {isLoadingActivity ? (
            <p>Loading activity...</p>
          ) : activity.length === 0 ? (
            <p>No activity recorded yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {activity.map(entry => (
                <li key={entry.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <strong style={{ marginRight: '0.5rem' }}>[{entry.type.toUpperCase()}]</strong>
                      <span>{entry.message}</span>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        by {entry.actor}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={22} /> Recruiter Access
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Add recruiters by name and email. Each entry generates an access token shown one time — share that token securely.
            This is a minimal registry intended to be replaced with Cognito/SSO; tokens here scope <em>future</em> per-recruiter
            audit context but do not yet replace the global admin token gate enforced by the API.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end', marginTop: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Name</label>
              <input className="form-control" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Jane Recruiter" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input className="form-control" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="jane@audleycg.com" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Role</label>
              <select className="form-control" value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleCreateUser} disabled={creatingUser}>
              {creatingUser ? 'Adding...' : 'Add'}
            </button>
          </div>

          {usersError && <p style={{ marginTop: '0.75rem', color: 'var(--error-color)' }}>{usersError}</p>}
          {lastCreatedToken && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-color-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--primary-color)' }}>
              <p style={{ margin: 0, fontWeight: 'bold' }}>Share this access token with the recruiter (will not be shown again):</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input readOnly className="form-control" value={lastCreatedToken} />
                <button className="btn btn-secondary" onClick={() => copyToClipboard(lastCreatedToken)}>
                  <Copy size={18} />
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '2rem' }}>
            {isLoadingUsers ? (
              <p>Loading users...</p>
            ) : users.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No recruiters added yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-color-alt)' }}>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>Name</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>Email</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>Role</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>Added</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem' }}>{u.name}</td>
                      <td style={{ padding: '0.75rem' }}>{u.email}</td>
                      <td style={{ padding: '0.75rem' }}>{u.role}</td>
                      <td style={{ padding: '0.75rem' }}>{new Date(u.createdAtUtc).toLocaleDateString()}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem' }} onClick={() => handleDeleteUser(u.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div>
          <MarkdownUploader onUpload={() => alert('Assessment uploaded successfully! In production, this saves directly to S3 as the global spec.')} />
        </div>
      )}

      {viewingCandidate && (
        <div className="modal-overlay open" onClick={() => setViewingCandidate(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Candidate Record</h2>
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
                <FileText size={18} /> Assessment Notes
              </p>
              <p style={{ margin: 0, fontStyle: 'italic' }}>
                {viewingCandidate.notes || 'No additional flags or notes were provided by the candidate.'}
              </p>
            </div>

            {viewingCandidate.analytics && (
              <div style={{ background: 'var(--bg-color-alt)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
                <p style={{ margin: '0 0 1rem 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={18} /> Session Analytics
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
                  <div>
                    <p style={{ margin: '0 0 0.25rem 0', color: 'var(--text-muted)' }}><Clock size={14} /> Total Time</p>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{viewingCandidate.analytics.totalTimeMs ? Math.round(viewingCandidate.analytics.totalTimeMs / 1000 / 60) : 0} minutes</p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 0.25rem 0', color: 'var(--text-muted)' }}><Globe size={14} /> IP Address</p>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{viewingCandidate.analytics.ipAddress || 'Unknown'}</p>
                  </div>
                </div>
              </div>
            )}

            {viewingCandidate.uploadLinks && viewingCandidate.uploadLinks.length > 0 ? (
              <div style={{ background: 'var(--bg-color-alt)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
                  <FileUp size={18} /> Candidate Evidence Uploads
                </p>
                <ul style={{ paddingLeft: '1.5rem', margin: 0, fontSize: '0.9rem' }}>
                  {viewingCandidate.uploadLinks.map((link, idx) => (
                    <li key={idx} style={{ marginBottom: '0.25rem' }}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">{link.filename}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>* This candidate did not upload any files.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const __ensureAdminToken = getAdminToken;
