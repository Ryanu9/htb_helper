import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Settings,
  X,
  Play,
  Square,
  RotateCcw,
  Clock,
  Search,
  Copy,
  Check,
  Loader2,
  Monitor,
  Wifi,
  RefreshCw,
  Flag,
  ClipboardPaste,
  Download,
} from "lucide-react";

interface ActiveMachine {
  id: number;
  name: string;
  ip: string;
  expires_at: string;
  is_spawning: boolean;
  type: string;
  avatar: string | null;
  info_status: string | null;
  os: string | null;
  difficulty: string | null;
  vpn_server_id: number | null;
}

interface SearchResult {
  id: number;
  name: string;
  os: string;
  difficulty: string;
  stars: number;
  active: boolean;
  retired: boolean;
  free: boolean;
  avatar: string | null;
  points: number;
  user_owns: number;
  root_owns: number;
  user_owned: boolean;
  root_owned: boolean;
  unreleased?: boolean;
}

interface ActionResult {
  success: boolean;
  message: string;
}

interface VpnServer {
  id: number;
  name: string;
  location: string;
  current_clients: number;
  full: boolean;
  is_assigned: boolean;
}

export default function HtbMachine({ isActive }: { isActive: boolean }) {
  const [token, setToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  const [activeMachine, setActiveMachine] = useState<ActiveMachine | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [spawnId, setSpawnId] = useState("");
  const [copied, setCopied] = useState(false);
  const [spawningId, setSpawningId] = useState<number | null>(null);

  const [flagInput, setFlagInput] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagResult, setFlagResult] = useState<{ success: boolean; message: string } | null>(null);
  const [vpnDownloading, setVpnDownloading] = useState("");
  const [showVpnPanel, setShowVpnPanel] = useState(false);
  const [vpnServers, setVpnServers] = useState<VpnServer[]>([]);
  const [vpnServersLoading, setVpnServersLoading] = useState(false);
  const [selectedVpnId, setSelectedVpnId] = useState<number | null>(null);
  const [vpnTab, setVpnTab] = useState<"machines" | "seasonal">("machines");
  const [vpnConfirmStep, setVpnConfirmStep] = useState(false);
  const vpnCacheRef = useRef<{ machines?: VpnServer[]; seasonal?: VpnServer[] }>({});

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    invoke<string>("get_htb_token").then((t) => {
      setToken(t);
      setTokenSaved(!!t);
      if (t) fetchActive(t);
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchActive = useCallback(async (tk?: string) => {
    const t = tk || token;
    if (!t) return;
    setLoading(true);
    setError("");
    try {
      const result = await invoke<ActiveMachine | null>("htb_get_active_machine");
      setActiveMachine(result);
      if (result?.is_spawning && !pollRef.current) {
        pollRef.current = setInterval(async () => {
          try {
            const r = await invoke<ActiveMachine | null>("htb_get_active_machine");
            setActiveMachine(r);
            if (!r?.is_spawning && pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          } catch { /* ignore */ }
        }, 5000);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  async function handleSaveToken() {
    try {
      await invoke("set_htb_token", { token: tokenInput });
      setToken(tokenInput);
      setTokenSaved(true);
      setShowTokenModal(false);
      fetchActive(tokenInput);
    } catch (e: any) {
      setError(String(e));
    }
  }

  async function handleSpawn() {
    const id = spawnId.trim();
    if (!id) return;
    await handleSpawnById(parseInt(id));
    setSpawnId("");
  }

  async function handleSpawnById(id: number) {
    setSpawningId(id);
    setActionLoading("spawn");
    setError("");
    setMessage("");
    try {
      const result = await invoke<ActionResult>("htb_spawn_machine", { machineId: id });
      setMessage(result.message);
      if (result.success) {
        setSearchResults([]);
        setSearchKeyword("");
        setTimeout(() => fetchActive(), 2000);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setActionLoading("");
      setSpawningId(null);
    }
  }

  async function handleReset() {
    if (!activeMachine) return;
    setActionLoading("reset");
    setError("");
    setMessage("");
    try {
      const result = await invoke<ActionResult>("htb_reset_machine", { machineId: activeMachine.id });
      setMessage(result.message);
      if (result.success) {
        setTimeout(() => fetchActive(), 3000);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setActionLoading("");
    }
  }

  async function handleStop() {
    if (!activeMachine) return;
    setActionLoading("stop");
    setError("");
    setMessage("");
    try {
      const result = await invoke<ActionResult>("htb_stop_machine", { machineId: activeMachine.id });
      setMessage(result.message);
      if (result.success) {
        setActiveMachine(null);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setActionLoading("");
    }
  }

  async function handleExtend() {
    if (!activeMachine) return;
    setActionLoading("extend");
    setError("");
    setMessage("");
    try {
      const result = await invoke<ActionResult>("htb_extend_machine", { machineId: activeMachine.id });
      setMessage(result.message);
      if (result.success) {
        setTimeout(() => fetchActive(), 2000);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setActionLoading("");
    }
  }

  async function handleSearch() {
    if (!searchKeyword.trim()) return;
    setSearching(true);
    setError("");
    try {
      const results = await invoke<SearchResult[]>("htb_search_machines", { keyword: searchKeyword.trim() });
      setSearchResults(results);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmitFlag(flagOverride?: string) {
    const flag = (flagOverride || flagInput).trim();
    if (!flag || !activeMachine) return;
    setFlagSubmitting(true);
    setFlagResult(null);
    setError("");
    try {
      const result = await invoke<ActionResult>("htb_submit_flag", { machineId: activeMachine.id, flag });
      setFlagResult(result);
      if (result.success) {
        setFlagInput("");
        setTimeout(() => fetchActive(), 2000);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setFlagSubmitting(false);
    }
  }

  async function handleSubmitFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (/^[a-fA-F0-9]{32}$/.test(trimmed)) {
        setFlagInput(trimmed);
        await handleSubmitFlag(trimmed);
      } else {
        setError("Clipboard does not contain a valid 32-char MD5 flag.");
      }
    } catch {
      setError("Failed to read clipboard.");
    }
  }

  async function openVpnPanel() {
    if (!activeMachine) return;
    setShowVpnPanel(true);
    setVpnConfirmStep(false);
    setSelectedVpnId(null);
    vpnCacheRef.current = {};
    setVpnTab("machines");
    await fetchVpnServers("machines");
  }

  async function fetchVpnServers(tab: "machines" | "seasonal") {
    if (vpnCacheRef.current[tab]) {
      setVpnServers(vpnCacheRef.current[tab]!);
      const assigned = vpnCacheRef.current[tab]!.find((s) => s.is_assigned);
      if (assigned) setSelectedVpnId(assigned.id);
      return;
    }
    setVpnServersLoading(true);
    try {
      const product = tab === "seasonal" ? "release_arena" : "labs";
      const servers = await invoke<VpnServer[]>("htb_get_vpn_servers", { product });
      vpnCacheRef.current[tab] = servers;
      setVpnServers(servers);
      const assigned = servers.find((s) => s.is_assigned);
      if (assigned) setSelectedVpnId(assigned.id);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setVpnServersLoading(false);
    }
  }

  async function handleSwitchVpnTab(tab: "machines" | "seasonal") {
    setVpnTab(tab);
    setSelectedVpnId(null);
    setVpnConfirmStep(false);
    await fetchVpnServers(tab);
  }

  async function handleDownloadVpn(tcp: boolean) {
    if (!selectedVpnId || !activeMachine) return;
    const proto = tcp ? "TCP" : "UDP";
    setVpnDownloading(proto);
    setError("");
    setMessage("");
    try {
      const server = vpnServers.find((s) => s.id === selectedVpnId);
      const serverLabel = server ? server.name : String(selectedVpnId);
      const defaultName = `${serverLabel}_${proto.toLowerCase()}.ovpn`;
      const savePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "OpenVPN Config", extensions: ["ovpn"] }],
      });
      if (!savePath) { setVpnDownloading(""); return; }
      const result = await invoke<ActionResult>("htb_download_vpn", {
        vpnServerId: selectedVpnId,
        tcp,
        savePath,
      });
      if (result.success) {
        setMessage(`VPN (${proto}) saved: ${savePath}`);
        setShowVpnPanel(false);
        try { await revealItemInDir(savePath); } catch { /* ignore */ }
      } else {
        setError(result.message);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setVpnDownloading("");
    }
  }

  function copyIp() {
    if (!activeMachine?.ip || activeMachine.ip === "-" || activeMachine.ip === "Assigning...") return;
    navigator.clipboard.writeText(activeMachine.ip);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function getDifficultyStyle(diff: string) {
    switch (diff) {
      case "Easy":   return { bg: "bg-green-500",  text: "text-white" };
      case "Medium": return { bg: "bg-amber-500",  text: "text-white" };
      case "Hard":   return { bg: "bg-red-500",    text: "text-white" };
      case "Insane": return { bg: "bg-purple-600", text: "text-white" };
      default:       return { bg: "bg-gray-400",   text: "text-white" };
    }
  }

  function formatExpiry(expiresAt: string) {
    if (!expiresAt) return "-";
    try {
      const normalized = expiresAt.includes("T") ? expiresAt : expiresAt.replace(" ", "T") + "Z";
      const d = new Date(normalized);
      const now = new Date();
      const diff = d.getTime() - now.getTime();
      if (diff <= 0) return "Expired";
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      return `${hours}h ${mins}m`;
    } catch {
      return expiresAt;
    }
  }

  const headerTarget = document.getElementById("header-actions");

  return (
    <div className="space-y-5">
      {/* Header Portal */}
      {isActive && headerTarget && createPortal(
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setTokenInput(token); setShowTokenModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-text-muted hover:bg-border hover:text-text text-xs font-medium transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            API Token
            {tokenSaved && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold leading-none">
                ✓
              </span>
            )}
          </button>
        </div>,
        headerTarget
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start justify-between gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <span>{error}</span>
          <button onClick={() => setError("")} className="shrink-0 p-0.5 rounded hover:bg-red-200 transition-colors cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className="flex items-start justify-between gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="shrink-0 p-0.5 rounded hover:bg-emerald-200 transition-colors cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Not configured */}
      {!tokenSaved && (
        <div className="text-center py-12">
          <Monitor className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <p className="text-text-muted mb-4">HTB API Token 未配置</p>
          <button
            onClick={() => setShowTokenModal(true)}
            className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors cursor-pointer"
          >
            配置 API Token
          </button>
        </div>
      )}

      {/* Active Machine Card */}
      {tokenSaved && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-5 py-3 bg-surface-alt border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text flex items-center gap-2">
              <Wifi className="w-4 h-4 text-green-600" />
              Active Machine
            </h3>
            <button
              onClick={() => fetchActive()}
              disabled={loading}
              className="p-1.5 rounded-lg text-text-muted hover:bg-border hover:text-text transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {activeMachine ? (
            <div className="p-5 space-y-4">
              {/* Machine Info Grid */}
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-surface-alt border border-border">
                  {activeMachine.avatar ? (
                    <img src={activeMachine.avatar} alt={activeMachine.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted">
                      <Monitor className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Name</div>
                  <div className="text-sm font-semibold text-text">{activeMachine.name}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">IP Address</div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-mono font-semibold ${activeMachine.is_spawning ? "text-amber-600" : "text-green-600"}`}>
                      {activeMachine.ip}
                    </span>
                    {!activeMachine.is_spawning && activeMachine.ip !== "-" && (
                      <button onClick={copyIp} className="p-0.5 rounded hover:bg-surface-alt transition-colors cursor-pointer">
                        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-text-muted" />}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Type</div>
                  <div className="text-sm text-text">{activeMachine.type || "-"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Expires In</div>
                  <div className="text-sm text-text flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    {formatExpiry(activeMachine.expires_at)}
                  </div>
                </div>
              </div>
              </div>

              {/* Machine Information */}
              {activeMachine.info_status && (
                <div className="px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <div className="text-[10px] uppercase tracking-wider text-indigo-400 mb-1.5 font-semibold">Machine Information</div>
                  <div className="text-sm text-indigo-900 leading-relaxed whitespace-pre-wrap">{activeMachine.info_status}</div>
                </div>
              )}

              {/* Spawning indicator */}
              {activeMachine.is_spawning && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Machine is spawning, waiting for IP assignment...
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={handleReset}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {actionLoading === "reset" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Reset
                </button>
                <button
                  onClick={handleExtend}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {actionLoading === "extend" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                  Extend
                </button>
                <button
                  onClick={handleStop}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {actionLoading === "stop" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                  Stop
                </button>
                {activeMachine.vpn_server_id && (
                  <>
                    <div className="w-px bg-border" />
                    <button
                      onClick={openVpnPanel}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      VPN
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5 text-center text-text-muted text-sm py-8">
              {loading ? "Loading..." : "No active machine"}
            </div>
          )}
        </div>
      )}

      {/* Submit Flag */}
      {tokenSaved && activeMachine && !activeMachine.is_spawning && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-5 py-3 bg-surface-alt border-b border-border">
            <h3 className="text-sm font-semibold text-text flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber-500" />
              Submit Flag
              <span className="text-xs text-text-muted font-normal">— {activeMachine.name}</span>
            </h3>
          </div>
          <div className="p-5">
            <div className="flex gap-2">
              <input
                type="text"
                value={flagInput}
                onChange={(e) => setFlagInput(e.target.value)}
                placeholder="Enter flag"
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-white text-text font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
                onKeyDown={(e) => e.key === "Enter" && handleSubmitFlag()}
                maxLength={32}
              />
              <button
                onClick={() => handleSubmitFromClipboard()}
                disabled={flagSubmitting}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-surface-alt text-text-muted hover:bg-border hover:text-text text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
                title="Paste from clipboard & submit"
              >
                <ClipboardPaste className="w-4 h-4" />
              </button>
              <button
                onClick={() => flagInput.trim() ? handleSubmitFlag() : handleSubmitFromClipboard()}
                disabled={flagSubmitting}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {flagSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                Submit
              </button>
            </div>
            {flagResult && (
              <div className={`mt-3 px-4 py-2.5 rounded-lg text-sm ${
                flagResult.success
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}>
                {flagResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spawn Machine */}
      {tokenSaved && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-5 py-3 bg-surface-alt border-b border-border">
            <h3 className="text-sm font-semibold text-text flex items-center gap-2">
              <Play className="w-4 h-4 text-green-600" />
              Spawn Machine
            </h3>
          </div>
          <div className="p-5 space-y-4">
            {/* Search + ID Input Row */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-white text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!searchKeyword.trim() || searching}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-40 transition-colors cursor-pointer"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
              <div className="w-px bg-border" />
              <input
                type="text"
                value={spawnId}
                onChange={(e) => setSpawnId(e.target.value)}
                placeholder="ID"
                className="w-20 px-3 py-2.5 rounded-lg border border-border bg-white text-text font-mono text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                onKeyDown={(e) => e.key === "Enter" && handleSpawn()}
              />
              <button
                onClick={handleSpawn}
                disabled={!spawnId.trim() || !!actionLoading}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {actionLoading === "spawn" && spawningId === null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Spawn
              </button>
            </div>

            {/* Search Results - Card Layout */}
            {searchResults.length > 0 && (
              <div className="grid gap-2">
                {searchResults.map((m) => {
                  const ds = getDifficultyStyle(m.difficulty);
                  const isSpawning = spawningId === m.id;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-4 px-4 py-3 rounded-xl border border-border hover:border-green-300 hover:bg-green-50/30 transition-all group"
                    >
                      {/* Machine Avatar */}
                      <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-surface-alt border border-border">
                        {m.avatar ? (
                          <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-muted">
                            <Monitor className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      {/* Name + ID */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text truncate">{m.name}</span>
                          <span className="text-[10px] font-mono text-text-muted shrink-0">#{m.id}</span>
                          {/* User/Root owned badges */}
                          {m.user_owned && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold leading-none">USER</span>
                          )}
                          {m.root_owned && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[9px] font-bold leading-none">ROOT</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-text-muted">{m.os}</span>
                          <span className="text-text-muted">·</span>
                          {m.unreleased ? (
                            <span className="text-[11px] text-violet-600 font-medium">Unreleased</span>
                          ) : m.retired ? (
                            <span className="text-[11px] text-text-muted">Retired</span>
                          ) : (
                            <span className="text-[11px] text-green-600 font-medium">Active</span>
                          )}
                          {m.free && (
                            <>
                              <span className="text-text-muted">·</span>
                              <span className="text-[11px] text-blue-600 font-medium">Free</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Difficulty Badge */}
                      <span className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold ${ds.bg} ${ds.text}`}>
                        {m.difficulty}
                      </span>

                      {/* Points */}
                      <div className="shrink-0 text-center">
                        <div className="text-sm font-bold text-text">{m.points}</div>
                        <div className="text-[9px] text-text-muted uppercase">pts</div>
                      </div>

                      {/* Owns count */}
                      <div className="shrink-0 flex items-center gap-2 text-[11px] text-text-muted">
                        <div className="text-center">
                          <div className="font-semibold text-text">{m.user_owns}</div>
                          <div className="text-[9px] uppercase">user</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-text">{m.root_owns}</div>
                          <div className="text-[9px] uppercase">root</div>
                        </div>
                      </div>

                      {/* Stars */}
                      <div className="shrink-0 flex items-center gap-0.5 text-amber-500">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-[11px] font-semibold">{m.stars?.toFixed(1) || "-"}</span>
                      </div>

                      {/* Spawn Button */}
                      <button
                        onClick={() => handleSpawnById(m.id)}
                        disabled={!!actionLoading}
                        className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-40 transition-all cursor-pointer shadow-sm hover:shadow"
                      >
                        {isSpawning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        {isSpawning ? "Spawning..." : "Spawn"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VPN Download Modal */}
      {showVpnPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-alt">
              <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-600" />
                Download VPN Config
              </h3>
              <button onClick={() => setShowVpnPanel(false)} className="p-1 rounded-lg hover:bg-border transition-colors cursor-pointer">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Machines / Seasonal Tabs */}
              <div className="flex gap-2">
                {([["machines", "Machines"], ["seasonal", "Seasonal"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => handleSwitchVpnTab(key)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      vpnTab === key
                        ? "bg-emerald-600 text-white"
                        : "bg-surface-alt text-text-muted hover:bg-border"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Server Selection */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2 font-semibold">
                  {vpnTab === "machines" ? "Machines VPN Servers" : "Release Arena VPN Servers"}
                </div>
                {vpnServersLoading ? (
                  <div className="flex items-center justify-center py-4 text-text-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading servers...
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
                    {vpnServers.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedVpnId(s.id); setVpnConfirmStep(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors cursor-pointer border-b border-border last:border-b-0 ${
                          selectedVpnId === s.id
                            ? "bg-emerald-50 text-emerald-700"
                            : "hover:bg-surface-alt text-text"
                        } ${s.full ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{s.name}</span>
                          {s.is_assigned && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold leading-none">
                              ASSIGNED
                            </span>
                          )}
                          {s.full && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[9px] font-bold leading-none">
                              FULL
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2 text-[11px] text-text-muted">
                          <span className="uppercase">{s.location}</span>
                          <span>{s.current_clients} users</span>
                        </div>
                      </button>
                    ))}
                    {vpnServers.length === 0 && !vpnServersLoading && (
                      <div className="px-3 py-4 text-center text-text-muted text-sm">No servers found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Download / Protocol Step */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setShowVpnPanel(false); setVpnConfirmStep(false); }}
                  className="px-4 py-2 rounded-lg text-sm text-text-muted hover:bg-surface-alt transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                {!vpnConfirmStep ? (
                  <button
                    onClick={() => setVpnConfirmStep(true)}
                    disabled={!selectedVpnId}
                    className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleDownloadVpn(false)}
                      disabled={!!vpnDownloading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      {vpnDownloading === "UDP" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      UDP
                    </button>
                    <button
                      onClick={() => handleDownloadVpn(true)}
                      disabled={!!vpnDownloading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      {vpnDownloading === "TCP" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      TCP
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-alt">
              <h3 className="text-sm font-semibold text-text">HTB API Token</h3>
              <button onClick={() => setShowTokenModal(false)} className="p-1 rounded-lg hover:bg-border transition-colors cursor-pointer">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-text-muted">
                Enter your Hack The Box API token. You can find it at{" "}
                <span className="font-mono text-primary">https://app.hackthebox.com/profile/settings</span>
              </p>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="eyJ0eXAiOiJKV1Qi..."
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-text font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowTokenModal(false)}
                  className="px-4 py-2 rounded-lg text-sm text-text-muted hover:bg-surface-alt transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveToken}
                  disabled={!tokenInput.trim()}
                  className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
