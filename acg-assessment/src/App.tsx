import { useState, useEffect } from 'react';
import { Header, type CurrentUser } from './components/Header';
import { AboutScreen } from './components/AboutScreen';
import { MarkdownUploader } from './components/MarkdownUploader';
import { AssessmentEngine } from './components/AssessmentEngine';
import { RecruiterDashboard } from './components/RecruiterDashboard';
import { setAdminToken } from './api/adminClient';

function App() {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [assessmentConfig, setAssessmentConfig] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

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

    const params = new URLSearchParams(window.location.search);
    if (params.get('invite')) {
      fetch('/initial_assessment.md')
        .then(res => res.text())
        .then(text => setAssessmentConfig(text))
        .catch(console.error);
    }

    return () => {
      window.removeEventListener('hashchange', updateAdminFromLocation);
      window.removeEventListener('popstate', updateAdminFromLocation);
    };
  }, []);

  const handleLogout = () => {
    setAdminToken('');
    setCurrentUser(null);
    if (!isAdmin) {
      window.location.reload();
    }
  };

  return (
    <>
      <Header
        onOpenAbout={() => setIsAboutOpen(true)}
        user={currentUser}
        onLogout={handleLogout}
        showAdminLink={!assessmentConfig && !isAdmin}
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
        ) : !assessmentConfig ? (
          <MarkdownUploader onUpload={setAssessmentConfig} />
        ) : (
          <AssessmentEngine
            markdownContent={assessmentConfig}
            onCandidateStart={(user) => setCurrentUser(user)}
          />
        )}
      </main>
    </>
  );
}

export default App;
