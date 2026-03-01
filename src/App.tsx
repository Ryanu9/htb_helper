import HtbMachine from "./components/HtbMachine";

function App() {
  return (
    <div className="flex flex-col h-screen bg-surface font-sans">
      {/* Top Bar */}
      <header className="h-[60px] flex items-center justify-between px-8 border-b border-border bg-white shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-semibold text-text">htb_helper</h1>
        </div>
        <div id="header-actions" />
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <HtbMachine isActive={true} />
      </div>
    </div>
  );
}

export default App;
