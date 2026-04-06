use std::path::PathBuf;
use tauri::Manager;

fn get_config_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_config_dir().unwrap_or_else(|_| PathBuf::from("."));
    std::fs::create_dir_all(&dir).ok();
    dir
}

// ── HTB API ── Multi-token management ──

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct TokenEntry {
    label: String,
    token: String,
    active: bool,
}

#[derive(serde::Serialize)]
struct TokenInfo {
    label: String,
    token_preview: String,
    active: bool,
}

fn tokens_path(app: &tauri::AppHandle) -> PathBuf {
    get_config_dir(app).join("htb_tokens.json")
}

fn load_all_tokens(app: &tauri::AppHandle) -> Vec<TokenEntry> {
    let path = tokens_path(app);
    if path.exists() {
        let data = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str::<Vec<TokenEntry>>(&data).unwrap_or_default()
    } else {
        // migrate from legacy htb_token.txt
        let legacy = get_config_dir(app).join("htb_token.txt");
        if legacy.exists() {
            let t = std::fs::read_to_string(&legacy).unwrap_or_default().trim().to_string();
            if !t.is_empty() {
                let entries = vec![TokenEntry { label: "Default".into(), token: t, active: true }];
                let _ = save_all_tokens(app, &entries);
                return entries;
            }
        }
        Vec::new()
    }
}

fn save_all_tokens(app: &tauri::AppHandle, tokens: &[TokenEntry]) -> Result<(), String> {
    let path = tokens_path(app);
    let data = serde_json::to_string_pretty(tokens).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

fn load_htb_token(app: &tauri::AppHandle) -> String {
    load_all_tokens(app)
        .iter()
        .find(|t| t.active)
        .map(|t| t.token.clone())
        .unwrap_or_default()
}

fn mask_token(token: &str) -> String {
    if token.len() <= 8 {
        "****".to_string()
    } else {
        format!("{}…{}", &token[..4], &token[token.len()-4..])
    }
}

#[tauri::command]
fn get_htb_token(app: tauri::AppHandle) -> String {
    load_htb_token(&app)
}

#[tauri::command]
fn set_htb_token(app: tauri::AppHandle, token: String) -> Result<(), String> {
    // legacy compat: if called, upsert a "Default" entry
    let mut tokens = load_all_tokens(&app);
    if let Some(entry) = tokens.iter_mut().find(|t| t.label == "Default") {
        entry.token = token;
        for t in tokens.iter_mut() { t.active = t.label == "Default"; }
    } else {
        for t in tokens.iter_mut() { t.active = false; }
        tokens.push(TokenEntry { label: "Default".into(), token, active: true });
    }
    save_all_tokens(&app, &tokens)
}

#[tauri::command]
fn get_htb_tokens(app: tauri::AppHandle) -> Vec<TokenInfo> {
    load_all_tokens(&app)
        .iter()
        .map(|t| TokenInfo {
            label: t.label.clone(),
            token_preview: mask_token(&t.token),
            active: t.active,
        })
        .collect()
}

#[tauri::command]
fn add_htb_token(app: tauri::AppHandle, label: String, token: String) -> Result<Vec<TokenInfo>, String> {
    let mut tokens = load_all_tokens(&app);
    // no duplicate labels
    if tokens.iter().any(|t| t.label == label) {
        return Err(format!("Label '{}' already exists", label));
    }
    let is_first = tokens.is_empty();
    if is_first {
        tokens.push(TokenEntry { label, token, active: true });
    } else {
        tokens.push(TokenEntry { label, token, active: false });
    }
    save_all_tokens(&app, &tokens)?;
    Ok(get_htb_tokens(app))
}

#[tauri::command]
fn remove_htb_token(app: tauri::AppHandle, label: String) -> Result<Vec<TokenInfo>, String> {
    let mut tokens = load_all_tokens(&app);
    let was_active = tokens.iter().find(|t| t.label == label).map_or(false, |t| t.active);
    tokens.retain(|t| t.label != label);
    // if removed the active one, activate first remaining
    if was_active {
        if let Some(first) = tokens.first_mut() {
            first.active = true;
        }
    }
    save_all_tokens(&app, &tokens)?;
    Ok(get_htb_tokens(app))
}

#[tauri::command]
fn switch_htb_token(app: tauri::AppHandle, label: String) -> Result<Vec<TokenInfo>, String> {
    let mut tokens = load_all_tokens(&app);
    if !tokens.iter().any(|t| t.label == label) {
        return Err(format!("Token '{}' not found", label));
    }
    for t in tokens.iter_mut() {
        t.active = t.label == label;
    }
    save_all_tokens(&app, &tokens)?;
    Ok(get_htb_tokens(app))
}

fn htb_client(token: &str) -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
    );
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    );
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .unwrap()
}

const HTB_API_BASE: &str = "https://labs.hackthebox.com/api/v4/";

#[derive(serde::Serialize)]
struct HtbActiveMachine {
    id: i64,
    name: String,
    ip: String,
    expires_at: String,
    is_spawning: bool,
    #[serde(rename = "type")]
    machine_type: String,
    avatar: Option<String>,
    info_status: Option<String>,
    os: Option<String>,
    difficulty: Option<String>,
    vpn_server_id: Option<i64>,
}

#[derive(serde::Serialize)]
struct HtbMachineProfile {
    id: i64,
    name: String,
    os: String,
    ip: Option<String>,
    active: bool,
    retired: bool,
    difficulty: String,
    stars: f64,
    points: i64,
    user_owns: i64,
    root_owns: i64,
    free: bool,
    is_spawned: bool,
    is_active: bool,
}

#[derive(serde::Serialize)]
struct HtbActionResult {
    success: bool,
    message: String,
}

#[tauri::command]
async fn htb_get_active_machine(app: tauri::AppHandle) -> Result<Option<HtbActiveMachine>, String> {
    let token = load_htb_token(&app);
    if token.is_empty() {
        return Err("HTB API Token not configured".into());
    }
    let client = htb_client(&token);
    let url = format!("{}machine/active", HTB_API_BASE);
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(None);
    }
    let body: serde_json::Value = serde_json::from_str(&text).map_err(|_| {
        let preview = &text[..text.len().min(300)];
        format!("HTTP {} — non-JSON response: {}", status.as_u16(), preview)
    })?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("HTTP {}: {}", status.as_u16(), msg));
    }
    let info = &body["info"];
    if info.is_null() || (info.is_object() && info.as_object().map_or(true, |o| o.is_empty())) {
        return Ok(None);
    }
    let avatar = info["avatar"].as_str().map(|a| {
        if a.starts_with("http") {
            a.to_string()
        } else {
            format!("https://htb-mp-prod-public-storage.s3.eu-central-1.amazonaws.com/{}", a.trim_start_matches('/'))
        }
    });
    let machine_id = info["id"].as_i64().unwrap_or(-1);
    let (info_status, os, difficulty) = if machine_id > 0 {
        let profile_url = format!("{}machine/profile/{}", HTB_API_BASE, machine_id);
        match client.get(&profile_url).send().await {
            Ok(resp) => {
                let profile_body: serde_json::Value = resp.json().await.unwrap_or_default();
                let pi = &profile_body["info"];
                (
                    pi["info_status"].as_str().map(|s| s.to_string()),
                    pi["os"].as_str().map(|s| s.to_string()),
                    pi["difficultyText"].as_str().map(|s| s.to_string()),
                )
            }
            Err(_) => (None, None, None),
        }
    } else {
        (None, None, None)
    };
    Ok(Some(HtbActiveMachine {
        id: machine_id,
        name: info["name"].as_str().unwrap_or("-").to_string(),
        ip: if info["isSpawning"].as_bool().unwrap_or(false) {
            "Assigning...".to_string()
        } else {
            info["ip"].as_str().unwrap_or("-").to_string()
        },
        expires_at: info["expires_at"].as_str().unwrap_or("").to_string(),
        is_spawning: info["isSpawning"].as_bool().unwrap_or(false),
        machine_type: info["type"].as_str().unwrap_or("").to_string(),
        avatar,
        info_status,
        os,
        difficulty,
        vpn_server_id: info["vpn_server_id"].as_i64(),
    }))
}

#[tauri::command]
async fn htb_get_machine(app: tauri::AppHandle, machine_id: String) -> Result<HtbMachineProfile, String> {
    let token = load_htb_token(&app);
    if token.is_empty() {
        return Err("HTB API Token not configured".into());
    }
    let client = htb_client(&token);
    let url = format!("{}machine/profile/{}", HTB_API_BASE, machine_id);
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = serde_json::from_str(if text.trim().is_empty() { "{}" } else { &text })
        .map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("HTTP {}: {}", status.as_u16(), msg));
    }
    let info = &body["info"];
    let play = &info["playInfo"];
    Ok(HtbMachineProfile {
        id: info["id"].as_i64().unwrap_or(-1),
        name: info["name"].as_str().unwrap_or("-").to_string(),
        os: info["os"].as_str().unwrap_or("Unknown").to_string(),
        ip: info["ip"].as_str().map(|s| s.to_string()),
        active: info["active"].as_bool().unwrap_or(false) || (info["active"].as_i64() == Some(1)),
        retired: info["retired"].as_bool().unwrap_or(false) || (info["retired"].as_i64() == Some(1)),
        difficulty: info["difficultyText"].as_str().unwrap_or("-").to_string(),
        stars: info["stars"].as_f64().unwrap_or(0.0),
        points: info["points"].as_i64().unwrap_or(0),
        user_owns: info["user_owns_count"].as_i64().unwrap_or(0),
        root_owns: info["root_owns_count"].as_i64().unwrap_or(0),
        free: info["free"].as_bool().unwrap_or(false),
        is_spawned: play["isSpawned"].as_bool().unwrap_or(false),
        is_active: play["isActive"].as_bool().unwrap_or(false),
    })
}

async fn htb_machine_action(app: &tauri::AppHandle, endpoint: &str, machine_id: i64) -> Result<HtbActionResult, String> {
    let token = load_htb_token(app);
    if token.is_empty() {
        return Err("HTB API Token not configured".into());
    }
    let client = htb_client(&token);
    let url = format!("{}{}", HTB_API_BASE, endpoint);
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "machine_id": machine_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = serde_json::from_str(if text.trim().is_empty() { "{}" } else { &text })
        .map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("Request failed");
        return Ok(HtbActionResult {
            success: false,
            message: msg.to_string(),
        });
    }
    let success = body["success"].as_str().map_or(true, |s| s != "0");
    let message = body["message"].as_str().unwrap_or("OK").to_string();
    Ok(HtbActionResult { success, message })
}

#[tauri::command]
async fn htb_submit_flag(app: tauri::AppHandle, machine_id: i64, flag: String) -> Result<HtbActionResult, String> {
    let token = load_htb_token(&app);
    if token.is_empty() {
        return Err("HTB API Token not configured".into());
    }
    let client = htb_client(&token);
    let url = format!("https://labs.hackthebox.com/api/v5/machine/own");
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "machine_id": machine_id, "flag": flag }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = serde_json::from_str(if text.trim().is_empty() { "{}" } else { &text })
        .map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("Flag submission failed");
        return Ok(HtbActionResult {
            success: false,
            message: msg.to_string(),
        });
    }
    let message = body["message"].as_str().unwrap_or("OK").to_string();
    Ok(HtbActionResult { success: true, message })
}

#[tauri::command]
async fn htb_spawn_machine(app: tauri::AppHandle, machine_id: i64) -> Result<HtbActionResult, String> {
    htb_machine_action(&app, "vm/spawn", machine_id).await
}

#[tauri::command]
async fn htb_reset_machine(app: tauri::AppHandle, machine_id: i64) -> Result<HtbActionResult, String> {
    htb_machine_action(&app, "vm/reset", machine_id).await
}

#[tauri::command]
async fn htb_stop_machine(app: tauri::AppHandle, machine_id: i64) -> Result<HtbActionResult, String> {
    htb_machine_action(&app, "vm/terminate", machine_id).await
}

#[tauri::command]
async fn htb_extend_machine(app: tauri::AppHandle, machine_id: i64) -> Result<HtbActionResult, String> {
    htb_machine_action(&app, "vm/extend", machine_id).await
}

fn map_machine_result(m: &serde_json::Value, is_retired: bool) -> serde_json::Value {
    let avatar = m["avatar"].as_str().map(|a| {
        if a.starts_with("http") {
            a.to_string()
        } else {
            format!("https://htb-mp-prod-public-storage.s3.eu-central-1.amazonaws.com/{}", a.trim_start_matches('/'))
        }
    });
    serde_json::json!({
        "id": m["id"],
        "name": m["name"],
        "os": m["os"],
        "difficulty": m["difficultyText"],
        "stars": m["stars"],
        "active": !is_retired,
        "retired": is_retired,
        "free": m["free"],
        "avatar": avatar,
        "points": m["points"],
        "user_owns": m["user_owns_count"],
        "root_owns": m["root_owns_count"],
        "user_owned": m["authUserInUserOwns"],
        "root_owned": m["authUserInRootOwns"],
    })
}

#[tauri::command]
async fn htb_search_machines(app: tauri::AppHandle, keyword: String) -> Result<Vec<serde_json::Value>, String> {
    let token = load_htb_token(&app);
    if token.is_empty() {
        return Err("HTB API Token not configured".into());
    }
    let client = htb_client(&token);
    let encoded_keyword = keyword.replace(' ', "%20");

    let url_active = format!("{}machine/paginated?per_page=20&sort_type=desc&keyword={}", HTB_API_BASE, encoded_keyword);
    let url_retired = format!("{}machine/list/retired/paginated?per_page=20&sort_type=desc&keyword={}", HTB_API_BASE, encoded_keyword);
    let url_unreleased = format!("{}machine/unreleased", HTB_API_BASE);

    let (resp_active, resp_retired, resp_unreleased) = tokio::join!(
        client.get(&url_active).send(),
        client.get(&url_retired).send(),
        client.get(&url_unreleased).send()
    );

    let mut results: Vec<serde_json::Value> = Vec::new();

    if let Ok(resp) = resp_active {
        if resp.status().is_success() {
            if let Ok(body) = resp.json::<serde_json::Value>().await {
                if let Some(data) = body["data"].as_array() {
                    for m in data {
                        results.push(map_machine_result(m, false));
                    }
                }
            }
        }
    }

    if let Ok(resp) = resp_retired {
        if resp.status().is_success() {
            if let Ok(body) = resp.json::<serde_json::Value>().await {
                if let Some(data) = body["data"].as_array() {
                    for m in data {
                        results.push(map_machine_result(m, true));
                    }
                }
            }
        }
    }

    let keyword_lower = keyword.to_lowercase();
    if let Ok(resp) = resp_unreleased {
        if resp.status().is_success() {
            if let Ok(body) = resp.json::<serde_json::Value>().await {
                if let Some(data) = body["data"].as_array() {
                    for m in data {
                        let name = m["name"].as_str().unwrap_or("");
                        if keyword_lower.is_empty() || name.to_lowercase().contains(&keyword_lower) {
                            let mut entry = map_machine_result(m, false);
                            entry["unreleased"] = serde_json::json!(true);
                            entry["active"] = serde_json::json!(false);
                            results.push(entry);
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

#[derive(serde::Serialize)]
struct VpnServerEntry {
    id: i64,
    name: String,
    location: String,
    current_clients: i64,
    full: bool,
    is_assigned: bool,
}

#[tauri::command]
async fn htb_get_vpn_servers(app: tauri::AppHandle, product: String) -> Result<Vec<VpnServerEntry>, String> {
    let token = load_htb_token(&app);
    if token.is_empty() {
        return Err("HTB API Token not configured".into());
    }
    let client = htb_client(&token);
    let url = format!("{}connections/servers?product={}", HTB_API_BASE, product);
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = serde_json::from_str(if text.trim().is_empty() { "{}" } else { &text })
        .map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("HTTP {}: {}", status.as_u16(), msg));
    }
    let data = &body["data"];
    let assigned_id = data["assigned"]["id"].as_i64().unwrap_or(-1);
    let options = &data["options"];
    let mut servers: Vec<VpnServerEntry> = Vec::new();
    if let Some(locations) = options.as_object() {
        for (_location, roles) in locations {
            if let Some(roles_obj) = roles.as_object() {
                for (_role, role_data) in roles_obj {
                    if let Some(svrs) = role_data["servers"].as_object() {
                        for (_sid, s) in svrs {
                            let id = s["id"].as_i64().unwrap_or(0);
                            servers.push(VpnServerEntry {
                                id,
                                name: s["friendly_name"].as_str().unwrap_or("-").to_string(),
                                location: s["location"].as_str().unwrap_or("-").to_string(),
                                current_clients: s["current_clients"].as_i64().unwrap_or(0),
                                full: s["full"].as_bool().unwrap_or(false),
                                is_assigned: id == assigned_id,
                            });
                        }
                    }
                }
            }
        }
    }
    servers.sort_by(|a, b| {
        b.is_assigned.cmp(&a.is_assigned)
            .then(a.location.cmp(&b.location))
            .then(a.current_clients.cmp(&b.current_clients))
    });
    Ok(servers)
}

fn htb_response_preview(text: &str, fallback: &str) -> String {
    if text.trim().is_empty() {
        fallback.to_string()
    } else {
        text[..text.len().min(200)].to_string()
    }
}

fn htb_response_message(text: &str, fallback: &str) -> String {
    serde_json::from_str::<serde_json::Value>(if text.trim().is_empty() { "{}" } else { text })
        .ok()
        .and_then(|body| body["message"].as_str().map(|message| message.to_string()))
        .unwrap_or_else(|| htb_response_preview(text, fallback))
}

fn is_vpn_not_assigned_message(message: &str) -> bool {
    message.to_ascii_lowercase().contains("you are not assigned")
}

async fn htb_switch_vpn_server_request(client: &reqwest::Client, vpn_server_id: i64) -> Result<Result<(), HtbActionResult>, String> {
    let url = format!("{}connections/servers/switch/{}", HTB_API_BASE, vpn_server_id);
    let resp = client.post(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body = serde_json::from_str::<serde_json::Value>(if text.trim().is_empty() { "{}" } else { &text }).ok();
    let message = body
        .as_ref()
        .and_then(|value| value["message"].as_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| htb_response_preview(&text, "Could not switch VPN Server."));

    if !status.is_success() {
        return Ok(Err(HtbActionResult {
            success: false,
            message: format!("HTTP {}: {}", status.as_u16(), message),
        }));
    }

    let switch_succeeded = body
        .as_ref()
        .and_then(|value| {
            value["status"]
                .as_bool()
                .or_else(|| value["status"].as_i64().map(|status| status != 0))
                .or_else(|| value["status"].as_str().map(|status| status != "0" && !status.eq_ignore_ascii_case("false")))
        })
        .unwrap_or(true);

    if !switch_succeeded {
        return Ok(Err(HtbActionResult {
            success: false,
            message,
        }));
    }

    Ok(Ok(()))
}

async fn htb_download_vpn_bytes(client: &reqwest::Client, vpn_server_id: i64, tcp: bool) -> Result<Result<Vec<u8>, HtbActionResult>, String> {
    let url = if tcp {
        format!("{}access/ovpnfile/{}/0/1", HTB_API_BASE, vpn_server_id)
    } else {
        format!("{}access/ovpnfile/{}/0", HTB_API_BASE, vpn_server_id)
    };
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Ok(Err(HtbActionResult {
            success: false,
            message: format!("HTTP {}: {}", status.as_u16(), htb_response_message(&text, "VPN download failed")),
        }));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(Ok(bytes.to_vec()))
}

#[tauri::command]
async fn htb_download_vpn(app: tauri::AppHandle, vpn_server_id: i64, tcp: bool, save_path: String) -> Result<HtbActionResult, String> {
    let token = load_htb_token(&app);
    if token.is_empty() {
        return Err("HTB API Token not configured".into());
    }
    let client = htb_client(&token);
    let mut switch_retries = 0;

    loop {
        match htb_download_vpn_bytes(&client, vpn_server_id, tcp).await? {
            Ok(bytes) => {
                std::fs::write(&save_path, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;
                return Ok(HtbActionResult {
                    success: true,
                    message: format!("VPN file saved to {}", save_path),
                });
            }
            Err(result) => {
                if switch_retries >= 2 || !is_vpn_not_assigned_message(&result.message) {
                    return Ok(result);
                }

                match htb_switch_vpn_server_request(&client, vpn_server_id).await? {
                    Ok(()) => {
                        switch_retries += 1;
                    }
                    Err(result) => return Ok(result),
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_htb_token, set_htb_token,
            get_htb_tokens, add_htb_token, remove_htb_token, switch_htb_token,
            htb_get_active_machine, htb_get_machine,
            htb_submit_flag,
            htb_spawn_machine, htb_reset_machine, htb_stop_machine, htb_extend_machine,
            htb_search_machines,
            htb_get_vpn_servers,
            htb_download_vpn,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(icon);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
