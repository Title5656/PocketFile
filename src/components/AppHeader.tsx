import { Settings2, ShieldCheck, SunMoon } from 'lucide-react';
import type { Theme } from '../types';

interface AppHeaderProps {
  theme: Theme;
  onThemeToggle: () => void;
  onSettings: () => void;
  onHome: () => void;
}

export function AppHeader({ theme, onThemeToggle, onSettings, onHome }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button className="brand-button" type="button" onClick={onHome} aria-label="PocketFile หน้าแรก">
          <img src={`${import.meta.env.BASE_URL}pocketfile.svg`} alt="" className="brand-mark" />
          <span className="brand-copy">
            <strong>PocketFile</strong>
            <small>เครื่องมือไฟล์ส่วนตัว</small>
          </span>
        </button>
        <div className="header-actions">
          <div className="privacy-pill"><ShieldCheck size={16} strokeWidth={2.2} /><span>ไฟล์อยู่บนอุปกรณ์</span></div>
          <button className="icon-button" type="button" onClick={onThemeToggle} aria-label="สลับธีม" title={theme === 'light' ? 'เปิดโหมดมืด' : 'เปิดโหมดสว่าง'}>
            <SunMoon size={19} />
          </button>
          <button className="icon-button" type="button" onClick={onSettings} aria-label="ตั้งค่า" title="ตั้งค่า">
            <Settings2 size={19} />
          </button>
        </div>
      </div>
    </header>
  );
}
