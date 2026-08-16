use base64::Engine;
use screenshots::Screen;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 缓存屏幕列表（枚举显示器较慢，只需一次）
static SCREENS: OnceLock<Vec<Screen>> = OnceLock::new();

fn get_screens() -> Result<&'static Vec<Screen>, String> {
    if let Some(screens) = SCREENS.get() {
        return Ok(screens);
    }
    let screens = Screen::all().map_err(|e| format!("无法获取屏幕列表: {}", e))?;
    Ok(SCREENS.get_or_init(|| screens))
}

#[derive(Serialize, Clone)]
pub struct ScreenshotResult {
    pub path: String,
    pub base64: String,
    pub timestamp: String,
}

#[derive(Serialize, Clone)]
pub struct CaptureEvent {
    pub status: String,
    pub message: String,
    pub path: Option<String>,
}

/// 百度 OCR Token 响应
#[derive(serde::Deserialize)]
struct BaiduTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

/// 百度 OCR 响应
#[derive(serde::Deserialize)]
struct BaiduOcrResponse {
    words_result: Option<Vec<BaiduOcrWord>>,
    words_result_num: Option<u32>,
    error_code: Option<serde_json::Value>,
    error_msg: Option<String>,
}

#[derive(serde::Deserialize)]
struct BaiduOcrWord {
    words: String,
}

async fn response_text(response: reqwest::Response, service: &str) -> Result<String, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("{} 响应读取失败: {}", service, e))?;

    if !status.is_success() {
        return Err(format!(
            "{} 请求失败（HTTP {}）：{}",
            service,
            status.as_u16(),
            body.chars().take(300).collect::<String>()
        ));
    }

    Ok(body)
}

/// Tauri 命令：通过原生 HTTP 调用百度 OCR，避免 WebView 跨域限制
#[tauri::command]
async fn ocr_baidu(
    base64_image: String,
    api_key: String,
    secret_key: String,
) -> Result<String, String> {
    if api_key.trim().is_empty() || secret_key.trim().is_empty() {
        return Err("百度 OCR API Key 和 Secret Key 不能为空".to_string());
    }

    let client = reqwest::Client::new();
    let token_response = client
        .post("https://aip.baidubce.com/oauth/2.0/token")
        .query(&[
            ("grant_type", "client_credentials"),
            ("client_id", api_key.trim()),
            ("client_secret", secret_key.trim()),
        ])
        .send()
        .await
        .map_err(|e| format!("百度 OCR Token 网络请求失败: {}", e))?;
    let token_body = response_text(token_response, "百度 OCR Token").await?;
    let token: BaiduTokenResponse = serde_json::from_str(&token_body)
        .map_err(|e| format!("百度 OCR Token 返回格式错误: {}", e))?;
    let access_token = token.access_token.ok_or_else(|| {
        format!(
            "获取百度 OCR token 失败：{}",
            token
                .error_description
                .or(token.error)
                .unwrap_or_else(|| "请检查 API Key 和 Secret Key".to_string())
        )
    })?;

    let image = base64_image
        .split_once(',')
        .map(|(_, value)| value)
        .unwrap_or(base64_image.as_str());
    let ocr_response = client
        .post("https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic")
        .query(&[("access_token", access_token.as_str())])
        .form(&[("image", image), ("language_type", "CHN_ENG")])
        .send()
        .await
        .map_err(|e| format!("百度 OCR 网络请求失败: {}", e))?;
    let ocr_body = response_text(ocr_response, "百度 OCR").await?;
    let result: BaiduOcrResponse = serde_json::from_str(&ocr_body)
        .map_err(|e| format!("百度 OCR 返回格式错误: {}", e))?;

    if result.error_msg.is_some() || result.error_code.is_some() {
        return Err(format!(
            "OCR 识别失败：{}",
            result
                .error_msg
                .unwrap_or_else(|| format!("错误码 {:?}", result.error_code))
        ));
    }

    let _ = result.words_result_num;
    result
        .words_result
        .ok_or_else(|| "百度 OCR 返回结果缺少 words_result".to_string())
        .map(|words| {
            words
                .into_iter()
                .map(|word| word.words)
                .filter(|word| !word.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        })
}

/// 获取截图存储根目录
fn get_screenshot_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    let root = app_data_dir.join("screenshots");
    fs::create_dir_all(&root).map_err(|e| format!("无法创建截图目录: {}", e))?;
    Ok(root)
}

/// 截取当前活动窗口
fn capture_active_window() -> Result<(Vec<u8>, u32, u32), String> {
    let screens = get_screens()?;

    // 获取主屏幕（包含活动窗口的屏幕）
    let screen = screens
        .first()
        .ok_or_else(|| "没有可用屏幕".to_string())?;

    let image = screen
        .capture()
        .map_err(|e| format!("截图失败: {}", e))?;

    let width = image.width();
    let height = image.height();

    // 将截图编码为 PNG（Fast 压缩 + NoFilter，速度优先）
    let mut png_data = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        &mut png_data,
        image::codecs::png::CompressionType::Fast,
        image::codecs::png::FilterType::NoFilter,
    );
    image::ImageEncoder::write_image(
        encoder,
        image.as_raw(),
        width,
        height,
        image::ColorType::Rgba8.into(),
    )
    .map_err(|e| format!("PNG 编码失败: {}", e))?;

    Ok((png_data, width, height))
}

/// 执行截图并保存
fn do_capture(app: &AppHandle, game: &str, server: &str) -> Result<ScreenshotResult, String> {
    let root = get_screenshot_root(app)?;
    let dir = root.join(game).join(server);
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建目录: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("{}.png", timestamp);
    let filepath = dir.join(&filename);

    let (png_data, _width, _height) = capture_active_window()?;

    fs::write(&filepath, &png_data).map_err(|e| format!("无法保存截图: {}", e))?;

    let base64_data = base64::engine::general_purpose::STANDARD.encode(&png_data);

    Ok(ScreenshotResult {
        path: filepath.to_string_lossy().to_string(),
        base64: base64_data,
        timestamp,
    })
}

/// Tauri 命令：手动触发截图
#[tauri::command]
async fn capture_screenshot(
    app: AppHandle,
    game: String,
    server: String,
) -> Result<ScreenshotResult, String> {
    do_capture(&app, &game, &server)
}

// ========== 框选截图 ==========

/// 窗口矩形信息（逻辑像素）
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowRectInfo {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub title: String,
}

/// 暂存的全屏截图数据（等待用户框选）
pub struct PendingCaptureData {
    pub png_data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub active_window: Option<WindowRectInfo>,
    pub windows: Vec<WindowRectInfo>,
}

pub struct PendingCapture(pub Mutex<Option<PendingCaptureData>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingCaptureInfo {
    pub base64: String,
    pub width: u32,
    pub height: u32,
    pub active_window: Option<WindowRectInfo>,
    pub windows: Vec<WindowRectInfo>,
}

/// 枚举所有可见顶层窗口（物理像素 → 逻辑像素），按 z-order 从顶到底
#[cfg(target_os = "windows")]
fn collect_windows(scale: f64) -> Vec<WindowRectInfo> {
    use windows::core::BOOL;
    use windows::Win32::{
        Foundation::{HWND, LPARAM, RECT},
        UI::WindowsAndMessaging::{
            EnumWindows, GetClassNameW, GetWindowRect, GetWindowTextW, IsIconic, IsWindowVisible,
        },
    };

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let list = &mut *(lparam.0 as *mut Vec<(RECT, String)>);
        if IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() {
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                let w = rect.right - rect.left;
                let h = rect.bottom - rect.top;
                if w > 10 && h > 10 {
                    let mut title_buf = [0u16; 256];
                    let len = GetWindowTextW(hwnd, &mut title_buf);
                    let title = String::from_utf16_lossy(&title_buf[..len as usize]);

                    let mut class_buf = [0u16; 256];
                    let clen = GetClassNameW(hwnd, &mut class_buf);
                    let class_name = String::from_utf16_lossy(&class_buf[..clen as usize]);

                    // 排除框选窗口/挂件自身和系统窗口（任务栏/桌面）
                    if title != "框选截图区域"
                        && title != "实时数据挂件"
                        && class_name != "Shell_TrayWnd"
                        && class_name != "Progman"
                        && class_name != "WorkerW"
                    {
                        list.push((rect, title));
                    }
                }
            }
        }
        BOOL(1)
    }

    let mut raw: Vec<(RECT, String)> = Vec::new();
    unsafe {
        let _ = EnumWindows(
            Some(enum_proc),
            LPARAM(&mut raw as *mut Vec<(RECT, String)> as isize),
        );
    }

    raw.into_iter()
        .map(|(r, title)| WindowRectInfo {
            x: r.left as f64 / scale,
            y: r.top as f64 / scale,
            width: (r.right - r.left) as f64 / scale,
            height: (r.bottom - r.top) as f64 / scale,
            title,
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn collect_windows(_scale: f64) -> Vec<WindowRectInfo> {
    Vec::new()
}

/// 获取当前前台窗口矩形（逻辑像素）
#[cfg(target_os = "windows")]
fn get_foreground_window_rect(scale: f64) -> Option<WindowRectInfo> {
    use windows::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, GetWindowTextW},
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).ok()?;
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        if w <= 10 || h <= 10 {
            return None;
        }
        let mut buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut buf);
        let title = String::from_utf16_lossy(&buf[..len as usize]);
        Some(WindowRectInfo {
            x: rect.left as f64 / scale,
            y: rect.top as f64 / scale,
            width: w as f64 / scale,
            height: h as f64 / scale,
            title,
        })
    }
}

#[cfg(not(target_os = "windows"))]
fn get_foreground_window_rect(_scale: f64) -> Option<WindowRectInfo> {
    None
}

/// Tauri 命令：开始框选截图 —— 截全屏暂存并显示预创建的框选覆盖窗口
#[tauri::command]
async fn start_region_capture(
    app: AppHandle,
    state: tauri::State<'_, PendingCapture>,
) -> Result<(), String> {
    // 防重入：框选窗口可见说明会话进行中，忽略后续触发
    if let Some(w) = app.get_webview_window("region-selector") {
        if w.is_visible().unwrap_or(false) {
            return Ok(());
        }
    }
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }

    // 1. 显示器信息（先取 scale 供窗口矩形转换）
    let monitor = app
        .primary_monitor()
        .map_err(|e| format!("获取显示器失败: {}", e))?
        .ok_or("没有主显示器")?;
    let scale = monitor.scale_factor();

    // 2. 收集窗口快照（必须在显示覆盖窗口之前，此时前台仍是目标窗口）
    let active_window = get_foreground_window_rect(scale);
    let windows = collect_windows(scale);

    // 3. 截全屏（必须在显示覆盖窗口之前，否则会截到覆盖层）
    let (png_data, width, height) = capture_active_window()?;

    // 4. 暂存截图与窗口信息
    *state.0.lock().map_err(|e| e.to_string())? = Some(PendingCaptureData {
        png_data,
        width,
        height,
        active_window,
        windows,
    });

    // 5. 显示预创建的框选窗口并通知前端加载新截图
    if let Some(w) = app.get_webview_window("region-selector") {
        let _ = w.emit("prepare-capture", ());
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        // 兜底：预创建窗口不存在则现场创建
        let logical_w = monitor.size().width as f64 / scale;
        let logical_h = monitor.size().height as f64 / scale;
        WebviewWindowBuilder::new(
            &app,
            "region-selector",
            overlay_url("region"),
        )
        .title("框选截图区域")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .position(0.0, 0.0)
        .inner_size(logical_w, logical_h)
        .focused(true)
        .build()
        .map_err(|e| format!("创建框选窗口失败: {}", e))?;
    }

    Ok(())
}

/// Tauri 命令：获取待框选的截图（覆盖窗口页面调用）
#[tauri::command]
async fn get_pending_capture(
    state: tauri::State<'_, PendingCapture>,
) -> Result<PendingCaptureInfo, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let data = guard.as_ref().ok_or("没有待处理的截图")?;
    Ok(PendingCaptureInfo {
        base64: base64::engine::general_purpose::STANDARD.encode(&data.png_data),
        width: data.width,
        height: data.height,
        active_window: data.active_window.clone(),
        windows: data.windows.clone(),
    })
}

/// Tauri 命令：完成框选 —— 裁剪保存并通知主窗口继续 OCR 流程
#[tauri::command]
async fn finish_region_capture(
    app: AppHandle,
    state: tauri::State<'_, PendingCapture>,
    game: String,
    server: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<ScreenshotResult, String> {
    // 1. 取出暂存截图
    let data = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("没有待处理的截图")?;

    // 2. CSS 像素 → 物理像素（处理高 DPI 缩放）
    let scale = app
        .get_webview_window("region-selector")
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0);

    let px = (x * scale).max(0.0) as u32;
    let py = (y * scale).max(0.0) as u32;
    let pw = ((width * scale) as u32).min(data.width.saturating_sub(px));
    let ph = ((height * scale) as u32).min(data.height.saturating_sub(py));

    if pw < 5 || ph < 5 {
        return Err("选区太小，请重新框选".to_string());
    }

    // 3. 裁剪并编码 PNG
    let img = image::load_from_memory(&data.png_data)
        .map_err(|e| format!("加载截图失败: {}", e))?;
    let cropped = img.crop_imm(px, py, pw, ph);

    let mut png_data = Vec::new();
    cropped
        .write_to(
            &mut std::io::Cursor::new(&mut png_data),
            image::ImageFormat::Png,
        )
        .map_err(|e| format!("PNG 编码失败: {}", e))?;

    // 4. 保存文件
    let root = get_screenshot_root(&app)?;
    let dir = root.join(&game).join(&server);
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建目录: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filepath = dir.join(format!("{}.png", timestamp));
    fs::write(&filepath, &png_data).map_err(|e| format!("无法保存截图: {}", e))?;

    let result = ScreenshotResult {
        path: filepath.to_string_lossy().to_string(),
        base64: base64::engine::general_purpose::STANDARD.encode(&png_data),
        timestamp,
    };

    // 5. 隐藏框选窗口（复用不销毁，下次秒开）
    if let Some(w) = app.get_webview_window("region-selector") {
        let _ = w.hide();
    }

    // 6. 通知主窗口继续 OCR 流程
    log::info!("截图已保存: {} ({}x{})", result.path, pw, ph);
    if let Err(e) = app.emit_to("main", "region-captured", result.clone()) {
        log::warn!("通知主窗口截图完成失败: {}", e);
    }

    Ok(result)
}

/// Tauri 命令：取消框选
#[tauri::command]
async fn cancel_region_capture(
    app: AppHandle,
    state: tauri::State<'_, PendingCapture>,
) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = None;

    if let Some(w) = app.get_webview_window("region-selector") {
        let _ = w.hide();
    }

    if let Err(e) = app.emit_to("main", "region-cancelled", ()) {
        log::warn!("通知主窗口取消截图失败: {}", e);
    }
    Ok(())
}

/// Tauri 命令：获取截图根目录路径
#[tauri::command]
async fn get_screenshot_dir(app: AppHandle) -> Result<String, String> {
    let root = get_screenshot_root(&app)?;
    Ok(root.to_string_lossy().to_string())
}

/// Tauri 命令：在文件管理器中打开截图存储目录
#[tauri::command]
async fn open_screenshot_dir(app: AppHandle) -> Result<(), String> {
    let root = get_screenshot_root(&app)?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&root)
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&root)
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&root)
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;

    Ok(())
}

/// Tauri 命令：读取图片文件并返回 base64
#[tauri::command]
async fn read_image_base64(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| format!("无法读取文件: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

/// Tauri 命令：获取日志目录路径
#[tauri::command]
async fn get_log_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("无法获取日志目录: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建日志目录: {}", e))?;
    Ok(dir.to_string_lossy().to_string())
}

/// Tauri 命令：在文件管理器中打开日志目录
#[tauri::command]
async fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("无法获取日志目录: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建日志目录: {}", e))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("无法打开目录: {}", e))?;

    Ok(())
}

/// 使用 Windows.Media.Ocr 本地识别图片文字（阻塞调用，需在 spawn_blocking 中运行）
#[cfg(target_os = "windows")]
fn ocr_with_winrt(path: &str) -> Result<String, String> {
    use windows::{
        core::HSTRING,
        Globalization::Language,
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine,
        Storage::{FileAccessMode, StorageFile},
    };

    // WinRT OCR 有最大图像尺寸限制（通常 2600px）
    let max_dim = OcrEngine::MaxImageDimension()
        .map_err(|e| format!("无法获取 OCR 引擎限制: {}", e))? as u32;

    // 图像预处理：放大 + 灰度 + 对比度增强，提升小字/描边字体识别率
    let mut ocr_path = path.to_string();
    if let Ok(img) = image::open(path) {
        // 放大 2x（小字是漏识别主因），不超过引擎尺寸限制
        let target_w = (img.width() * 2).min(max_dim);
        let target_h = (img.height() * 2).min(max_dim);
        let resized =
            img.resize_exact(target_w, target_h, image::imageops::FilterType::Lanczos3);

        // 灰度化去除彩色描边干扰 + 对比度增强让笔画更连贯
        let gray = resized.to_luma8();
        let enhanced = image::imageops::contrast(&gray, 30.0);

        let tmp = std::env::temp_dir().join("mhxy_ocr_preprocessed.png");
        enhanced
            .save(&tmp)
            .map_err(|e| format!("保存预处理图片失败: {}", e))?;
        ocr_path = tmp.to_string_lossy().to_string();
    }

    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(&ocr_path))
        .and_then(|op| op.get())
        .map_err(|e| format!("打开图片失败: {}", e))?;

    let stream = file
        .OpenAsync(FileAccessMode::Read)
        .and_then(|op| op.get())
        .map_err(|e| format!("读取图片流失败: {}", e))?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .and_then(|op| op.get())
        .map_err(|e| format!("图片解码失败: {}", e))?;

    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .and_then(|op| op.get())
        .map_err(|e| format!("获取位图失败: {}", e))?;

    // 优先中文简体引擎，不可用则回退到用户配置语言
    let engine = Language::CreateLanguage(&HSTRING::from("zh-Hans-CN"))
        .and_then(|lang| OcrEngine::TryCreateFromLanguage(&lang))
        .or_else(|_| OcrEngine::TryCreateFromUserProfileLanguages())
        .map_err(|e| format!("OCR 引擎创建失败（需安装中文语言包）: {}", e))?;

    let result = engine
        .RecognizeAsync(&bitmap)
        .and_then(|op| op.get())
        .map_err(|e| format!("OCR 识别失败: {}", e))?;

    let text = result
        .Text()
        .map_err(|e| format!("获取识别文本失败: {}", e))?;

    Ok(text.to_string())
}

#[cfg(not(target_os = "windows"))]
fn ocr_with_winrt(_path: &str) -> Result<String, String> {
    Err("本地 OCR 仅支持 Windows 平台".to_string())
}

/// Tauri 命令：本地 OCR 识别（Windows.Media.Ocr）
#[tauri::command]
async fn ocr_local(path: String) -> Result<String, String> {
    let path_clone = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || ocr_with_winrt(&path_clone))
        .await
        .map_err(|e| format!("OCR 任务执行失败: {}", e))?;

    match &result {
        Ok(text) => {
            log::info!("===== OCR 识别完成 =====");
            log::info!("图片: {}", path);
            log::info!("字符数: {}", text.chars().count());
            log::info!("识别文本:\n{}", text);
            log::info!("========================");
        }
        Err(e) => {
            log::warn!("OCR 识别失败 [{}]: {}", path, e);
        }
    }

    result
}

/// Tauri 命令：注册全局快捷键（带截图回调）
#[tauri::command]
async fn register_shortcut(app: AppHandle, shortcut_str: String) -> Result<(), String> {
    let shortcut = parse_shortcut(&shortcut_str)?;

    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("注销旧快捷键失败: {}", e))?;

    app.global_shortcut()
        .on_shortcut(shortcut, move |app, shortcut, event| {
            on_shortcut(app, shortcut, event);
        })
        .map_err(|e| format!("注册快捷键失败（可能被其他软件占用）: {}", e))?;

    Ok(())
}

/// 解析快捷键字符串（如 "Ctrl+Shift+S"）
fn parse_shortcut(s: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = s.split('+').collect();
    let mut modifiers = Modifiers::empty();
    let mut code = None;

    for part in &parts {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "alt" => modifiers |= Modifiers::ALT,
            "meta" | "cmd" | "super" => modifiers |= Modifiers::META,
            key => {
                code = Some(match key.to_uppercase().as_str() {
                    "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC,
                    "D" => Code::KeyD, "E" => Code::KeyE, "F" => Code::KeyF,
                    "G" => Code::KeyG, "H" => Code::KeyH, "I" => Code::KeyI,
                    "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
                    "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO,
                    "P" => Code::KeyP, "Q" => Code::KeyQ, "R" => Code::KeyR,
                    "S" => Code::KeyS, "T" => Code::KeyT, "U" => Code::KeyU,
                    "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
                    "Y" => Code::KeyY, "Z" => Code::KeyZ,
                    "F1" => Code::F1, "F2" => Code::F2, "F3" => Code::F3,
                    "F4" => Code::F4, "F5" => Code::F5, "F6" => Code::F6,
                    "F7" => Code::F7, "F8" => Code::F8, "F9" => Code::F9,
                    "F10" => Code::F10, "F11" => Code::F11, "F12" => Code::F12,
                    _ => return Err(format!("不支持的按键: {}", key)),
                });
            }
        }
    }

    let code = code.ok_or_else(|| "未指定按键".to_string())?;
    Ok(Shortcut::new(Some(modifiers), code))
}

/// 全局快捷键回调
fn on_shortcut(app: &AppHandle, _shortcut: &Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }

    // 发送事件通知前端截图已触发
    let _ = app.emit(
        "shortcut-triggered",
        CaptureEvent {
            status: "capturing".to_string(),
            message: "正在截图...".to_string(),
            path: None,
        },
    );

    // 从 localStorage 获取当前游戏和区服（通过事件参数传递）
    // 这里使用默认值，前端会在收到事件后调用 capture_screenshot
    let _ = app.emit(
        "shortcut-capture",
        CaptureEvent {
            status: "triggered".to_string(),
            message: "快捷键已触发，请调用 capture_screenshot".to_string(),
            path: None,
        },
    );
}

// ========== 桌面悬浮挂件 ==========

const WIDGET_LABEL: &str = "widget";
const WIDGET_MIN_W: f64 = 320.0;
const WIDGET_MIN_H: f64 = 180.0;

/// Tauri 命令：设置挂件是否置顶。默认不置顶，开启后才浮于最上层
#[tauri::command]
async fn set_widget_always_on_top(app: AppHandle, always_on_top: bool) -> Result<(), String> {
    let window = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or("挂件窗口不存在")?;
    window
        .set_always_on_top(always_on_top)
        .map_err(|e| format!("设置挂件置顶失败: {}", e))?;
    Ok(())
}

/// 根据 overlay 参数构造窗口 URL。
///
/// 开发模式下 tauri.conf.json 的 devUrl 会覆盖 `WebviewUrl::App` 路径上的 query 串，
/// 导致 overlay 参数丢失、窗口错误地加载主应用。因此 dev 模式改用 External 显式拼接 query，
/// 生产模式才使用 App 路径（构建产物始终带 query）。
fn overlay_url(overlay: &str) -> tauri::WebviewUrl {
    if cfg!(debug_assertions) {
        tauri::WebviewUrl::External(
            format!("http://localhost:5173/?overlay={}", overlay)
                .parse()
                .expect("挂件 URL 解析失败"),
        )
    } else {
        tauri::WebviewUrl::App(format!("index.html?overlay={}", overlay).into())
    }
}

/// 排除挂件窗口自身，避免框选时把挂件当成目标窗口
fn build_widget_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    WebviewWindowBuilder::new(app, WIDGET_LABEL, overlay_url("widget"))
    .title("实时数据挂件")
    .decorations(false)
    .transparent(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(false)
    // 挂件是唯一的数据表载体（主窗口已不再展示明细），
    // 配合 14px 字号给足默认宽高，避免一打开就横向滚动
    .inner_size(820.0, 480.0)
    .min_inner_size(WIDGET_MIN_W, WIDGET_MIN_H)
    .visible(false)
    .build()
    .map_err(|e| format!("创建挂件窗口失败: {}", e))
}

/// Tauri 命令：显示悬浮挂件（不存在则创建）
#[tauri::command]
async fn show_widget(app: AppHandle) -> Result<(), String> {
    let window = match app.get_webview_window(WIDGET_LABEL) {
        Some(w) => w,
        None => build_widget_window(&app)?,
    };

    window.show().map_err(|e| format!("显示挂件失败: {}", e))?;
    let _ = window.set_always_on_top(false);
    let _ = window.set_focus();
    // 同步可见性给主窗口，使开关状态始终与实际一致（避免「关不掉」的假象）
    let _ = app.emit_to("main", "widget-visibility", true);
    Ok(())
}

/// Tauri 命令：隐藏悬浮挂件（保留窗口以便下次秒开）
#[tauri::command]
async fn hide_widget(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WIDGET_LABEL) {
        window.hide().map_err(|e| format!("隐藏挂件失败: {}", e))?;
    }
    if let Err(e) = app.emit_to("main", "widget-visibility", false) {
        log::warn!("同步挂件可见性失败: {}", e);
    }
    Ok(())
}

/// Tauri 命令：查询挂件是否可见
#[tauri::command]
async fn is_widget_visible(app: AppHandle) -> Result<bool, String> {
    Ok(app
        .get_webview_window(WIDGET_LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false))
}

/// Tauri 命令：开始拖拽挂件（交给系统处理，避免手动跟随鼠标的抖动）
#[tauri::command]
async fn start_widget_drag(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or("挂件窗口不存在")?;
    window
        .start_dragging()
        .map_err(|e| format!("拖拽挂件失败: {}", e))
}

/// Tauri 命令：锁定/解锁挂件。锁定时禁止改变大小并让窗口忽略鼠标事件
#[tauri::command]
async fn set_widget_locked(app: AppHandle, locked: bool) -> Result<(), String> {
    let window = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or("挂件窗口不存在")?;

    window
        .set_resizable(!locked)
        .map_err(|e| format!("设置挂件可缩放状态失败: {}", e))?;

    Ok(())
}

/// 挂件当前的位置与尺寸（逻辑像素）
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WidgetBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Tauri 命令：读取挂件当前位置与尺寸，供前端计算缩放增量
#[tauri::command]
async fn get_widget_bounds(app: AppHandle) -> Result<WidgetBounds, String> {
    let window = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or("挂件窗口不存在")?;

    let scale = window.scale_factor().unwrap_or(1.0);
    let position = window
        .outer_position()
        .map_err(|e| format!("获取挂件位置失败: {}", e))?;
    let size = window
        .outer_size()
        .map_err(|e| format!("获取挂件尺寸失败: {}", e))?;

    Ok(WidgetBounds {
        x: position.x as f64 / scale,
        y: position.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    })
}

/// Tauri 命令：直接设置挂件位置与尺寸（锁定时忽略），尺寸按最小值钳制
#[tauri::command]
async fn set_widget_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};

    let window = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or("挂件窗口不存在")?;

    // 锁定时窗口被设为不可缩放，直接忽略请求，双保险防止绕过前端限制
    if !window.is_resizable().unwrap_or(true) {
        return Ok(());
    }

    let width = width.max(WIDGET_MIN_W);
    let height = height.max(WIDGET_MIN_H);

    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("设置挂件尺寸失败: {}", e))?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("设置挂件位置失败: {}", e))?;

    Ok(())
}

/// Tauri 命令：主窗口把新入库的记录增量转发给挂件
#[tauri::command]
async fn push_widget_records(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    if let Err(e) = app.emit_to(WIDGET_LABEL, "widget-records", payload) {
        log::warn!("push_widget_records 失败: {}", e);
    }
    Ok(())
}

/// Tauri 命令：主窗口把全部记录的权威快照推给挂件。
/// 挂件自身 webview 的 IndexedDB 为空（多 webview 不共享存储），
/// 必须以主窗口数据为准，否则列表永远为空。
#[tauri::command]
async fn sync_widget_records(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    if let Err(e) = app.emit_to(WIDGET_LABEL, "widget-sync", payload) {
        log::warn!("sync_widget_records 失败: {}", e);
    }
    Ok(())
}

/// Tauri 命令：通知挂件全量重载（数据被整体变更时）
#[tauri::command]
async fn emit_widget_reload(app: AppHandle) -> Result<(), String> {
    if let Err(e) = app.emit_to(WIDGET_LABEL, "widget-reload", ()) {
        log::warn!("emit_widget_reload 失败: {}", e);
    }
    Ok(())
}

/// Tauri 命令：通知挂件 OCR 识别状态切换
#[tauri::command]
async fn emit_widget_recognizing(app: AppHandle, recognizing: bool) -> Result<(), String> {
    if let Err(e) = app.emit_to(WIDGET_LABEL, "widget-recognizing", recognizing) {
        log::warn!("emit_widget_recognizing 失败: {}", e);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PendingCapture(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            capture_screenshot,
            get_screenshot_dir,
            open_screenshot_dir,
            get_log_dir,
            open_log_dir,
            read_image_base64,
            register_shortcut,
            ocr_local,
            ocr_baidu,
            start_region_capture,
            get_pending_capture,
            finish_region_capture,
            cancel_region_capture,
            show_widget,
            hide_widget,
            is_widget_visible,
            start_widget_drag,
            set_widget_locked,
            get_widget_bounds,
            set_widget_bounds,
            set_widget_always_on_top,
            push_widget_records,
            sync_widget_records,
            emit_widget_reload,
            emit_widget_recognizing,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 预创建隐藏的框选窗口（WebView2 创建开销大，复用可实现秒开）
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let scale = monitor.scale_factor();
                let logical_w = monitor.size().width as f64 / scale;
                let logical_h = monitor.size().height as f64 / scale;
                let _ = WebviewWindowBuilder::new(
                    app,
                    "region-selector",
                    overlay_url("region"),
                )
                .title("框选截图区域")
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .shadow(false)
                .position(0.0, 0.0)
                .inner_size(logical_w, logical_h)
                .visible(false)
                .build();
            }

            // 预创建悬浮挂件窗口：默认开启（数据表只在挂件里看），
            // 因此预创建后直接显示，主窗口启动不再额外 show，避免重复窗口。
            // 若构建失败也不致命，用户仍可手动开启。
            match build_widget_window(app.handle()) {
                Ok(window) => {
                    // 预创建时已 visible(false)，这里直接显示即可；
                    // 置顶状态交由挂件挂载时按配置（WidgetConfig.alwaysOnTop）统一设置，
                    // 不在此抢设，避免与「默认不置顶」的预期冲突。
                    if let Err(e) = window.show() {
                        log::warn!("挂件窗口显示失败: {}", e);
                    }
                    // 同步可见性给主窗口，使其开关初始即为「开」
                    if let Err(e) = app.emit_to("main", "widget-visibility", true) {
                        log::warn!("同步挂件可见性失败: {}", e);
                    }
                }
                Err(e) => log::warn!("挂件窗口预创建失败: {}", e),
            }

            // 注册默认全局快捷键 Ctrl+Shift+S
            // 失败（如被其他软件占用）时不崩溃，仅通知前端，用户可在设置页更换
            let shortcut = Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::SHIFT),
                Code::KeyS,
            );

            if let Err(e) = app
                .global_shortcut()
                .on_shortcut(shortcut, move |app, shortcut, event| {
                    on_shortcut(app, shortcut, event);
                })
            {
                log::warn!("默认快捷键注册失败: {}", e);
                let _ = app.handle().emit(
                    "shortcut-register-failed",
                    CaptureEvent {
                        status: "error".to_string(),
                        message: format!("快捷键 Ctrl+Shift+S 被占用，请在设置页更换快捷键"),
                        path: None,
                    },
                );
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
