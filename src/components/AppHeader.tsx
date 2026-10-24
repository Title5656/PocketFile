interface AppHeaderProps { onHome: () => void }

export function AppHeader({onHome}:AppHeaderProps) {
  return <header className="app-header"><div className="header-inner">
    <button className="brand-button" type="button" onClick={onHome} aria-label="PocketFile หน้าแรก">
      <img src={`${import.meta.env.BASE_URL}pocketfile-logo-dark.svg`} alt="PocketFile — เครื่องมือไฟล์ส่วนตัว" className="brand-mark" width="165" height="54" />
    </button>
  </div></header>;
}
