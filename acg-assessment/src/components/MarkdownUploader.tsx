import React, { useRef } from 'react';
import { UploadCloud, FileText } from 'lucide-react';

interface MarkdownUploaderProps {
  onUpload: (markdownContent: string) => void;
}

export const MarkdownUploader: React.FC<MarkdownUploaderProps> = ({ onUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.name.endsWith('.md') || file.name.endsWith('.txt'))) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          onUpload(event.target.result);
        }
      };
      reader.readAsText(file);
    } else if (file) {
      alert("Please upload a valid Markdown (.md) or Text (.txt) file.");
    }
  };

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
      <div 
        style={{ 
          border: '2px dashed var(--border-color)', 
          borderRadius: 'var(--radius-lg)',
          padding: '4rem 2rem',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)'
        }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file && (file.name.endsWith('.md') || file.name.endsWith('.txt'))) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target && typeof event.target.result === 'string') {
                onUpload(event.target.result);
              }
            };
            reader.readAsText(file);
          }
        }}
      >
        <UploadCloud size={48} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
        <h3 style={{ marginBottom: '0.5rem' }}>Upload Assessment File</h3>
        <p style={{ margin: 0 }}>Drag and drop an .md or .txt file here, or click to browse.</p>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".md,.txt" 
          onChange={handleFileChange} 
        />
        
        <button className="btn btn-primary" style={{ marginTop: '2rem' }}>
          <FileText size={18} />
          Select Assessment File
        </button>
      </div>

      <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
        <h4 style={{ color: 'var(--text-muted)' }}>Or Use Default Assessment</h4>
        <button 
          className="btn btn-secondary" 
          style={{ width: '100%', marginTop: '1rem' }}
          onClick={() => {
            fetch('/initial_assessment.md')
              .then(res => res.text())
              .then(text => onUpload(text))
              .catch(() => alert("Could not load default assessment."));
          }}
        >
          Load Standard ACG Pre-Hire Spec
        </button>
      </div>
    </div>
  );
};
