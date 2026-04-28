import { useState, useEffect } from 'react';
import { Header, type CurrentUser } from './components/Header';
import { AboutScreen } from './components/AboutScreen';
import { LandingScreen } from './components/LandingScreen';
import { AssessmentEngine } from './components/AssessmentEngine';
import { RecruiterDashboard } from './components/RecruiterDashboard';
import { setAdminToken } from './api/adminClient';

function App() {
  const hasInvite = (() => {
    if (typeof window === 'undefined') return false;
    return !!new URLSearchParams(window.location.search).get('invite');
  })();

  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [assessmentConfig, setAssessmentConfig] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const detectAdminRoute = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === 'true') return true;

      const adminPaths = ['/admin', '/recruiter', '/dashboard'];
      const pathname = window.location.pathname.replace(/\/+$/, '').toLowerCase();
      if (adminPaths.includes(pathname)) return true;

      const hash = window.location.hash.replace(/^#/, '').replace(/\/+$/, '').toLowerCase();
      if (adminPaths.includes(hash)) return true;

      return false;
    };

    const updateAdminFromLocation = () => setIsAdmin(detectAdminRoute());
    updateAdminFromLocation();

    window.addEventListener('hashchange', updateAdminFromLocation);
    window.addEventListener('popstate', updateAdminFromLocation);

    if (hasInvite) {
      fetch('/initial_assessment.md')
        .then(res => res.text())
        .then(text => setAssessmentConfig(text))
        .catch(console.error);
    }

    return () => {
      window.removeEventListener('hashchange', updateAdminFromLocation);
      window.removeEventListener('popstate', updateAdminFromLocation);
    };
  }, [hasInvite]);

  const handleLogout = () => {
    setAdminToken('');
    setCurrentUser(null);
    if (!isAdmin) {
      window.location.reload();
    }
  };

  const showAssessment = !isAdmin && hasInvite && assessmentConfig && hasStarted;
  const showLanding = !isAdmin && !showAssessment;

  return (
    <>
      <Header
        onOpenAbout={() => setIsAboutOpen(true)}
        user={currentUser}
        onLogout={handleLogout}
        showAdminLink={!showAssessment && !isAdmin}
      />

      <AboutScreen
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      <main>
        {isAdmin ? (
          <RecruiterDashboard
            currentUser={currentUser}
            onLogin={(user) => setCurrentUser(user)}
          />
        ) : showAssessment ? (
          <AssessmentEngine
            markdownContent={assessmentConfig!}
            onCandidateStart={(user) => setCurrentUser(user)}
          />
        ) : showLanding ? (
          <LandingScreen
            hasInvite={hasInvite && !!assessmentConfig}
            onContinue={() => setHasStarted(true)}
          />
        ) : null}
      </main>
    </>
  );
}

export default App;
