import React from 'react';
import versionInfo from '../version_info.json';
import { X, MapPin, Info, CheckCircle2 } from 'lucide-react';

interface AboutScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutScreen: React.FC<AboutScreenProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Info size={24} color="var(--primary-color)" />
            About Assessment Tool
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
        
        <div style={{ padding: '1.5rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <img src="/logo.png" alt="ACG Logo" style={{ height: '32px' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Audley Consulting Group</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Pre-Hire Assessment Platform</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginTop: '1rem' }}>
            <MapPin size={20} color="var(--accent-color)" style={{ marginTop: '0.2rem' }} />
            <div>
              <p style={{ margin: 0, fontWeight: 500 }}>Headquarters</p>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>375 Derwood Circle</p>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>Rockville, MD 20850</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginTop: '1rem' }}>
            <Info size={20} color="var(--primary-color)" style={{ marginTop: '0.2rem' }} />
            <div>
              <p style={{ margin: 0, fontWeight: 500 }}>Contact</p>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>301-770-6464</p>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>hello@audleyconsultinggroup.com</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', fontSize: '0.9rem' }}>
          <div style={{ color: 'var(--text-muted)' }}>
            <strong>Version:</strong> {versionInfo.major}.{versionInfo.minor}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            <strong>Released:</strong> {versionInfo.date}
          </div>
        </div>
        
        <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={onClose}>
          <CheckCircle2 size={18} />
          Close
        </button>
      </div>
    </div>
  );
};
