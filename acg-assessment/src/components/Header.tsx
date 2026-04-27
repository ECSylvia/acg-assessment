import React, { useState, useRef, useEffect } from 'react';
import { Info, User, Settings, LogOut, ChevronDown, Lock } from 'lucide-react';

export type CurrentUser = {
  name: string;
  role: string;
  isRecruiter: boolean;
};

interface HeaderProps {
  onOpenAbout: () => void;
  user: CurrentUser | null;
  onLogout: () => void;
  showAdminLink?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAbout, user, onLogout, showAdminLink = true }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="app-header">
      <div className="brand">
        <img src="/logo.png" alt="ACG Logo" style={{ height: '32px' }} />
        <span style={{ marginLeft: '10px' }}>Assessment Engine</span>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-secondary" onClick={onOpenAbout} style={{ padding: '0.5rem 1rem' }}>
          <Info size={18} />
          <span style={{ fontSize: '0.9rem' }}>About</span>
        </button>

        {showAdminLink && !user && (
          <a
            href="/admin"
            title="Recruiter / Admin Login"
            aria-label="Recruiter / Admin Login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.4rem',
              opacity: 0.45,
              color: 'var(--text-muted, #888)',
              textDecoration: 'none',
              borderRadius: 'var(--radius-sm, 4px)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.45'; }}
          >
            <Lock size={14} />
          </a>
        )}

        {user && (
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--glass-bg)' }}
            >
              <User size={18} />
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{user.name}</span>
              <ChevronDown size={16} />
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                background: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                minWidth: '200px',
                zIndex: 100,
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden'
              }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-color-alt)' }}>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>{user.name}</p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.role}</p>
                </div>
                
                {user.isRecruiter && (
                  <button className="dropdown-item" style={dropdownItemStyle} onClick={() => alert("Settings coming soon!")}>
                    <Settings size={16} /> Settings
                  </button>
                )}
                
                <button
                  className="dropdown-item"
                  style={{ ...dropdownItemStyle, color: 'var(--accent-color)' }}
                  onClick={() => {
                    setDropdownOpen(false);
                    onLogout();
                  }}
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-color)',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: '0.9rem'
};
