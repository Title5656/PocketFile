import { ArrowLeft, LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ToolMeta } from '../types';

interface ToolWorkspaceProps {
  tool: ToolMeta;
  onBack: () => void;
  children: ReactNode;
}

export function ToolWorkspace({ tool, onBack, children }: ToolWorkspaceProps) {
  const Icon = tool.icon;
  return (
    <main className="workspace-page">
      <button className="back-button" type="button" onClick={onBack} aria-label="กลับไปหน้าแรก">
        <ArrowLeft size={17} /> <span>เครื่องมือทั้งหมด</span>
      </button>
      <section className="workspace-heading">
        <span className={`workspace-icon tool-card--${tool.tint}`}><Icon size={24} /></span>
        <div>
          <p className="eyebrow">{tool.category === 'image' ? 'IMAGE TOOLS' : 'PDF TOOLS'}</p>
          <h1>{tool.title}</h1>
          <p>{tool.description}</p>
        </div>
      </section>
      <div className="workspace-body">{children}</div>
      <div className="workspace-privacy"><LockKeyhole size={15} /><span>ไฟล์นี้ประมวลผลบนอุปกรณ์ของคุณ</span></div>
    </main>
  );
}
