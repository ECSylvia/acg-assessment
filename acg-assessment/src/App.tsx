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
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
      setIsAdmin(true);
    }

    if (params.get('invite')) {
      fetch('/initial_assessment.md')
        .then(res => res.text())
        .then(text => setAssessmentConfig(text))
        .catch(console.error);
    }
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
