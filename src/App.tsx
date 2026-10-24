import { lazy, Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { FileCheck2, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Modal } from './components/Modal';
import { AppHeader } from './components/AppHeader';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToolCard } from './components/ToolCard';
import { ToolWorkspace } from './components/ToolWorkspace';
import { toolById, toolCatalog } from './data/tools';
import { readPreferences, writePreferences } from './lib/preferences';
import type { Preferences, ToolCategory, ToolId } from './types';

const emptyPreferences: Preferences = { theme: 'light', recentTools: [] };
const ImageTools = lazy(() => import('./tools/ImageTools').then((module) => ({ default: module.ImageTools })));
const PdfTools = lazy(() => import('./tools/PdfTools').then((module) => ({ default: module.PdfTools })));

function loadPreferences(): Preferences {
  try {
    return readPreferences(window.localStorage);
  } catch {
    return emptyPreferences;
  }
}

function savePreferences(preferences: Preferences) {
  try {
    writePreferences(window.localStorage, preferences);
  } catch {
    // Keep the app usable even when the browser blocks local storage.
  }
}

function matchesTool(toolId: ToolId, query: string): boolean {
  const tool = toolById.get(toolId);
  if (!tool) return false;
  const term = query.trim().toLocaleLowerCase('th');
  if (!term) return true;
  return [tool.title, tool.description, ...tool.keywords]
    .some((value) => value.toLocaleLowerCase('th').includes(term));
}

export default function App() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [query, setQuery] = useState('');
  const fromHash=()=>{const id=window.location.hash.slice(1) as ToolId;return toolById.has(id)?id:null;};
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(fromHash);
  const [pendingTool,setPendingTool]=useState<ToolId|null>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const activeRef=useRef<ToolId|null>(activeToolId);
  const workRef=useRef(false);
  const historyIndex=useRef(0);
  const restoreIndex=useRef<number|null>(null);
  const pendingIndex=useRef<number|null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmClearRecent, setConfirmClearRecent] = useState(false);
  const [hasToolWork, setHasToolWork] = useState(false);
  const [confirmLeaveTool, setConfirmLeaveTool] = useState(false);

  activeRef.current=activeToolId;workRef.current=hasToolWork;
  useEffect(()=>{
    history.replaceState({pocketfileIndex:historyIndex.current},'',window.location.href);
    const hash=()=>{
      const next=fromHash();
      const index=typeof history.state?.pocketfileIndex==='number'?history.state.pocketfileIndex:historyIndex.current+1;
      if(restoreIndex.current!==null){
        if(index===restoreIndex.current)restoreIndex.current=null;
        return;
      }
      if(next===activeRef.current)return;
      if(workRef.current){
        pendingIndex.current=index;setPendingTool(next);setConfirmLeaveTool(true);
        restoreIndex.current=historyIndex.current;
        history.go(historyIndex.current-index);
      }else{
        historyIndex.current=index;
        history.replaceState({pocketfileIndex:index},'',window.location.href);
        activeRef.current=next;setActiveToolId(next);setHasToolWork(false);
      }
    };
    const before=(event:BeforeUnloadEvent)=>{if(workRef.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('popstate',hash);window.addEventListener('beforeunload',before);
    return()=>{window.removeEventListener('popstate',hash);window.removeEventListener('beforeunload',before);};
  },[]);
  useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&searchRef.current){event.preventDefault();searchRef.current.focus();searchRef.current.select();}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[]);
  const activeTool = activeToolId ? toolById.get(activeToolId) : undefined;
  const visibleTools = useMemo(
    () => toolCatalog.filter((tool) => matchesTool(tool.id, query)),
    [query],
  );
  const groupedTools = useMemo(() => ({
    image: visibleTools.filter((tool) => tool.category === 'image'),
    pdf: visibleTools.filter((tool) => tool.category === 'pdf'),
  }), [visibleTools]);

  const updatePreferences = (next: Preferences) => {
    setPreferences(next);
    savePreferences(next);
  };

  const pushTool = (id:ToolId|null) => {
    historyIndex.current+=1;
    history.pushState({pocketfileIndex:historyIndex.current},'',id?`#${id}`:window.location.pathname+window.location.search);
  };

  const openTool = (toolId: ToolId) => {
    const recentTools = [toolId, ...preferences.recentTools.filter((id) => id !== toolId)].slice(0, 4);
    updatePreferences({ ...preferences, recentTools });
    setHasToolWork(false);
    pushTool(toolId);
    setActiveToolId(toolId);
  };

  const toggleTheme = () => {
    updatePreferences({ ...preferences, theme: preferences.theme === 'light' ? 'dark' : 'light' });
  };

  const clearRecentTools = () => {
    updatePreferences({ ...preferences, recentTools: [] });
    setConfirmClearRecent(false);
  };

  const leaveTool = () => {
    workRef.current=false;activeRef.current=pendingTool;
    setActiveToolId(pendingTool);
    if(pendingIndex.current!==null){
      const destination=pendingIndex.current;pendingIndex.current=null;
      restoreIndex.current=destination;history.go(destination-historyIndex.current);historyIndex.current=destination;
    }else pushTool(pendingTool);
    setQuery('');
    setHasToolWork(false);
    setConfirmLeaveTool(false);
  };
  const returnHome = () => {
    pendingIndex.current=null;
    setPendingTool(null);
    if (hasToolWork) { setConfirmLeaveTool(true); return; }
    setActiveToolId(null);pushTool(null);setQuery('');setHasToolWork(false);
  };

  const renderGroup = (category: ToolCategory, title: string, label: string) => {
    const tools = groupedTools[category];
    if (tools.length === 0) return null;
    return (
      <section className="tool-section" aria-labelledby={`${category}-heading`} key={category}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{label}</p>
            <h2 id={`${category}-heading`}>{title}</h2>
          </div>
          <span className="section-count">{tools.length} เครื่องมือ</span>
        </div>
        <div className="tool-grid">
          {tools.map((tool) => <ToolCard key={tool.id} tool={tool} onSelect={() => openTool(tool.id)} />)}
        </div>
      </section>
    );
  };

  return (
    <div className="app-shell" data-theme={preferences.theme}>
      <AppHeader
        theme={preferences.theme}
        onThemeToggle={toggleTheme}
        onSettings={() => setShowSettings(true)}
        onHome={returnHome}
      />
      {activeTool ? (
        <ToolWorkspace tool={activeTool} onBack={returnHome}>
          <Suspense fallback={<div className="workspace-start-card" role="status"><span>กำลังเตรียมเครื่องมือ…</span></div>}>
            {activeTool.category === 'image'
              ? <ImageTools key={activeTool.id} toolId={activeTool.id} onDirtyChange={setHasToolWork} />
              : <PdfTools key={activeTool.id} toolId={activeTool.id} onDirtyChange={setHasToolWork} />}
          </Suspense>
        </ToolWorkspace>
      ) : (
        <main className="dashboard">
          <section className="hero-card">
            <div className="hero-copy">
              <span className="hero-kicker"><Sparkles size={14} /> FILE UTILITY, MADE SIMPLE</span>
              <h1>จัดการไฟล์<br /><span>ได้ในที่เดียว</span></h1>
              <p>เครื่องมือรูปภาพและ PDF ที่เรียบง่าย ปลอดภัย และพร้อมใช้บนทุกอุปกรณ์</p>
              <label className="search-box">
                <Search size={19} aria-hidden="true" />
                <input
                  ref={searchRef}
                  onKeyDown={e=>{if(e.key==='Escape')setQuery('');}}
                  type="search"
                  aria-label="ค้นหาเครื่องมือ"
                  placeholder="ลองค้นหา เช่น PDF, บีบอัดรูป..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? <button type="button" aria-label="ล้างคำค้นหา" onClick={() => setQuery('')}><X size={17} /></button> : <kbd>Ctrl / ⌘ K</kbd>}
              </label>
              <div className="hero-trust"><ShieldCheck size={15} /><span>ไฟล์จะอยู่บนอุปกรณ์ของคุณ</span></div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-art-orbit orbit-one" />
              <div className="hero-art-orbit orbit-two" />
              <div className="hero-art-main"><img src={`${import.meta.env.BASE_URL}pocketfile.svg`} alt="" /></div>
              <div className="floating-file floating-file--top"><span className="floating-dot" /> <span>image.jpg</span><b>−42%</b></div>
              <div className="floating-file floating-file--bottom"><FileCheck2 size={19} /><span>พร้อมดาวน์โหลด</span></div>
              <div className="hero-art-sparkle sparkle-a">✦</div><div className="hero-art-sparkle sparkle-b">✧</div>
            </div>
          </section>

          {preferences.recentTools.length > 0 && !query ? (
            <section className="recent-section" aria-labelledby="recent-heading">
              <div className="section-heading section-heading--compact">
                <div><p className="eyebrow">PICK UP WHERE YOU LEFT</p><h2 id="recent-heading">ใช้ล่าสุด</h2></div>
                <button className="text-button" type="button" onClick={() => setConfirmClearRecent(true)}>ล้างรายการ</button>
              </div>
              <div className="recent-grid">
                {preferences.recentTools.map((id) => {
                  const tool = toolById.get(id);
                  return tool ? <ToolCard key={id} tool={tool} recent onSelect={() => openTool(id)} /> : null;
                })}
              </div>
            </section>
          ) : null}

          {visibleTools.length > 0 ? (
            <div className="tool-groups">
              {renderGroup('image', 'เครื่องมือรูปภาพ', 'IMAGE TOOLS')}
              {renderGroup('pdf', 'เครื่องมือ PDF', 'PDF TOOLS')}
            </div>
          ) : (
            <section className="empty-search">
              <span><Search size={23} /></span>
              <h2>ไม่พบเครื่องมือที่ค้นหา</h2>
              <p>ลองค้นหาด้วยคำอื่น หรือดูเครื่องมือทั้งหมดอีกครั้ง</p>
              <button className="button button--primary" type="button" onClick={() => setQuery('')}>ดูเครื่องมือทั้งหมด</button>
            </section>
          )}

          <footer className="dashboard-footer">
            <div className="footer-lock"><ShieldCheck size={17} /><span>ความเป็นส่วนตัวเป็นค่าเริ่มต้น</span></div>
            <span>ทำงานในเบราว์เซอร์ • ไม่อัปโหลดไฟล์</span>
          </footer>
        </main>
      )}

      {showSettings ? (
        <Modal className="settings-dialog" labelledBy="settings-title" onClose={()=>setShowSettings(false)}>
            <div className="settings-dialog-head">
              <div><p className="eyebrow">YOUR PREFERENCES</p><h2 id="settings-title">ตั้งค่า PocketFile</h2></div>
              <button className="icon-button" type="button" onClick={() => setShowSettings(false)} aria-label="ปิดหน้าต่าง"><X size={18} /></button>
            </div>
            <div className="settings-row">
              <div><strong>ธีม</strong><small>เลือกโหมดที่สบายตา</small></div>
              <div className="theme-choice">
                <button className={preferences.theme === 'light' ? 'selected' : ''} type="button" onClick={() => updatePreferences({ ...preferences, theme: 'light' })}>สว่าง</button>
                <button className={preferences.theme === 'dark' ? 'selected' : ''} type="button" onClick={() => updatePreferences({ ...preferences, theme: 'dark' })}>มืด</button>
              </div>
            </div>
            <div className="settings-row">
              <div><strong>ภาษา</strong><small>ภาษาหลักของแอป</small></div>
              <span className="language-chip">ไทย</span>
            </div>
            <div className="settings-privacy"><ShieldCheck size={18} /><p>ไฟล์ของคุณทำงานในอุปกรณ์นี้ PocketFile ไม่เก็บไฟล์ รูปภาพ หรือเอกสารไว้ในบัญชีหรือเซิร์ฟเวอร์</p></div>
            <button className="button button--primary settings-done" type="button" onClick={() => setShowSettings(false)}>เรียบร้อย</button>
        </Modal>
      ) : null}

      {confirmClearRecent ? (
        <ConfirmDialog
          title="ล้างเครื่องมือที่ใช้ล่าสุด?"
          message="รายการนี้จะถูกลบจากการตั้งค่าบนอุปกรณ์ และไฟล์ของคุณจะไม่ได้รับผลกระทบ"
          confirmLabel="ล้างรายการ"
          onConfirm={clearRecentTools}
          onCancel={() => setConfirmClearRecent(false)}
        />
      ) : null}
      {confirmLeaveTool ? (
        <ConfirmDialog
          title="ออกจากเครื่องมือนี้?"
          message="ไฟล์และผลลัพธ์ที่ยังไม่ได้ดาวน์โหลดจะหายไปจากหน้านี้"
          confirmLabel="ออกจากเครื่องมือ"
          onConfirm={leaveTool}
          onCancel={() => setConfirmLeaveTool(false)}
        />
      ) : null}
    </div>
  );
}
