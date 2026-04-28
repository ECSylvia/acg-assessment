import React from 'react';
import { ShieldCheck } from 'lucide-react';
import heroImage from '../assets/hero.png';

interface LandingScreenProps {
  hasInvite: boolean;
  onContinue: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ hasInvite, onContinue }) => {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 65px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        background:
          'radial-gradient(ellipse at top left, #1e293b 0%, #0f172a 45%, #020617 100%)',
        color: '#f1f5f9',
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          width: '100%',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          borderRadius: '1rem',
          padding: '3rem 2.5rem',
          boxShadow:
            '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(148, 163, 184, 0.08) inset',
          textAlign: 'center',
          backdropFilter: 'blur(8px)',
        }}
      >
        <img
          src={heroImage}
          alt="ACG"
          style={{
            width: '160px',
            height: 'auto',
            margin: '0 auto 1.5rem',
            display: 'block',
            filter: 'drop-shadow(0 8px 24px rgba(59, 130, 246, 0.25))',
          }}
        />

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0.9rem',
            borderRadius: '999px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#6ee7b7',
            fontSize: '0.8rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: '1.25rem',
          }}
        >
          <ShieldCheck size={14} /> ACG-Approved Site
        </div>

        <h1
          style={{
            fontSize: '2.25rem',
            fontWeight: 800,
            color: '#f8fafc',
            marginBottom: '1rem',
            letterSpacing: '-0.02em',
          }}
        >
          ACG Pre-Hire Assessment
        </h1>

        <p
          style={{
            fontSize: '1.05rem',
            lineHeight: 1.6,
            color: '#cbd5e1',
            maxWidth: '560px',
            margin: '0 auto 2rem',
          }}
        >
          This ACG-approved assessment site helps candidates complete and
          submit required pre-hire technical tasks securely.
        </p>

        {hasInvite ? (
          <button
            onClick={onContinue}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.85rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: '#ffffff',
              background:
                'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: '1px solid #1d4ed8',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.5)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform =
                'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform =
                'translateY(0)';
            }}
          >
            Begin Assessment
          </button>
        ) : (
          <p
            style={{
              fontSize: '0.9rem',
              color: '#94a3b8',
              margin: 0,
              padding: '1rem 1.25rem',
              background: 'rgba(148, 163, 184, 0.08)',
              borderRadius: '0.5rem',
              border: '1px solid rgba(148, 163, 184, 0.15)',
            }}
          >
            Candidates: please use the personalized invite link sent to your
            email to begin the assessment.
          </p>
        )}
      </div>
    </div>
  );
};
