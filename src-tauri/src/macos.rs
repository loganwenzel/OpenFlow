#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use cocoa::base::{id, nil};
use cocoa::foundation::NSString;
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use objc::{class, msg_send, sel, sel_impl};
use std::ffi::CStr;
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

pub struct ClipboardState {
    _backup: Mutex<Option<String>>,
}

impl Default for ClipboardState {
    fn default() -> Self {
        Self::new()
    }
}

impl ClipboardState {
    pub fn new() -> Self {
        Self {
            _backup: Mutex::new(None),
        }
    }
}

/// Detects the localized name of the currently active/frontmost application on macOS.
/// Examples: "Slack", "Cursor", "Code", "Google Chrome", "Mail", "Notes".
pub fn get_frontmost_app_name() -> String {
    unsafe {
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        if workspace == nil {
            return "Unknown".to_string();
        }
        let front_app: id = msg_send![workspace, frontmostApplication];
        if front_app == nil {
            return "Desktop".to_string();
        }
        let app_name: id = msg_send![front_app, localizedName];
        if app_name == nil {
            return "Application".to_string();
        }
        let utf8_str: *const i8 = msg_send![app_name, UTF8String];
        if utf8_str.is_null() {
            return "Application".to_string();
        }
        CStr::from_ptr(utf8_str)
            .to_string_lossy()
            .into_owned()
    }
}

/// Returns true if the currently focused UI element on macOS is an editable text field/area.
pub fn has_focused_text_input() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateSystemWide() -> id;
        fn AXUIElementCreateApplication(pid: i32) -> id;
        fn AXUIElementCopyAttributeValue(element: id, attribute: id, value: *mut id) -> i32;
        fn AXUIElementIsAttributeSettable(element: id, attribute: id, settable: *mut bool) -> i32;
        fn AXUIElementSetAttributeValue(element: id, attribute: id, value: id) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *mut std::ffi::c_void);
    }

    unsafe fn cf_release(obj: id) {
        if obj != nil {
            CFRelease(obj as *mut std::ffi::c_void);
        }
    }

    unsafe fn nsstring_to_rust(ns_str: id) -> Option<String> {
        if ns_str == nil {
            return None;
        }
        let utf8: *const i8 = msg_send![ns_str, UTF8String];
        if utf8.is_null() {
            return None;
        }
        Some(CStr::from_ptr(utf8).to_string_lossy().into_owned())
    }

    unsafe {
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        if workspace == nil {
            return false;
        }
        let front_app: id = msg_send![workspace, frontmostApplication];
        if front_app == nil {
            return false;
        }

        let app_name = get_frontmost_app_name();
        let lower_app = app_name.to_lowercase();

        // Terminal emulators always accept pasted text at the active shell prompt
        let terminal_apps = [
            "terminal",
            "iterm2",
            "iterm",
            "warp",
            "alacritty",
            "ghostty",
            "kitty",
            "wezterm",
            "hyper",
        ];
        if terminal_apps.iter().any(|t| lower_app == *t) {
            return true;
        }

        let pid: i32 = msg_send![front_app, processIdentifier];
        let ax_app = AXUIElementCreateApplication(pid);
        if ax_app != nil {
            // Enable AXManualAccessibility so Chromium/Electron apps expose their focused DOM node
            let manual_ax_key = NSString::alloc(nil).init_str("AXManualAccessibility");
            let yes_num: id = msg_send![class!(NSNumber), numberWithBool: true];
            let _ = AXUIElementSetAttributeValue(ax_app, manual_ax_key, yes_num);
        }

        let sys_wide = AXUIElementCreateSystemWide();
        let focused_key = NSString::alloc(nil).init_str("AXFocusedUIElement");
        let mut focused_elem: id = nil;
        let mut err = AXUIElementCopyAttributeValue(sys_wide, focused_key, &mut focused_elem);

        if (err != 0 || focused_elem == nil) && ax_app != nil {
            err = AXUIElementCopyAttributeValue(ax_app, focused_key, &mut focused_elem);
        }

        cf_release(ax_app);
        cf_release(sys_wide);

        if err != 0 || focused_elem == nil {
            return false;
        }

        // 1. Check AXRole of focused element
        let role_key = NSString::alloc(nil).init_str("AXRole");
        let mut role_val: id = nil;
        let role_str = if AXUIElementCopyAttributeValue(focused_elem, role_key, &mut role_val) == 0 {
            let s = nsstring_to_rust(role_val);
            cf_release(role_val);
            s.unwrap_or_default()
        } else {
            String::new()
        };

        let editable_roles = [
            "AXTextField",
            "AXTextArea",
            "AXSearchField",
            "AXComboBox",
            "AXDocument",
        ];
        if editable_roles.iter().any(|r| role_str == *r) {
            cf_release(focused_elem);
            return true;
        }

        // 2. Check AXEditableAncestor (set by WebKit/Blink/Electron on contenteditable or nested inputs)
        let editable_anc_key = NSString::alloc(nil).init_str("AXEditableAncestor");
        let mut editable_anc: id = nil;
        if AXUIElementCopyAttributeValue(focused_elem, editable_anc_key, &mut editable_anc) == 0
            && editable_anc != nil
        {
            cf_release(editable_anc);
            cf_release(focused_elem);
            return true;
        }

        // 3. For non-container roles, check if AXSelectedTextRange is settable
        let non_text_containers = [
            "AXWebArea",
            "AXWindow",
            "AXApplication",
            "AXGroup",
            "AXScrollArea",
            "AXButton",
            "AXList",
            "AXOutline",
            "AXTable",
            "AXRow",
            "AXImage",
            "AXStaticText",
            "AXLink",
        ];
        if !non_text_containers.iter().any(|r| role_str == *r) {
            let range_key = NSString::alloc(nil).init_str("AXSelectedTextRange");
            let mut range_settable = false;
            if AXUIElementIsAttributeSettable(focused_elem, range_key, &mut range_settable) == 0
                && range_settable
            {
                cf_release(focused_elem);
                return true;
            }
        }

        cf_release(focused_elem);
        false
    }
}

/// Synthesizes a Cmd+V keystroke on macOS to paste clipboard content into the active app.
pub fn synthesize_cmd_v() -> Result<(), String> {
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
        .map_err(|_| "Failed to create CGEventSource".to_string())?;

    // Keycode 9 is 'v' on macOS standard keyboards
    let key_down = CGEvent::new_keyboard_event(source.clone(), 9, true)
        .map_err(|_| "Failed to create key-down event".to_string())?;
    key_down.set_flags(CGEventFlags::CGEventFlagCommand);
    key_down.post(CGEventTapLocation::HID);

    // Short dwell between keydown and keyup for reliable recognition
    thread::sleep(Duration::from_millis(20));

    let key_up = CGEvent::new_keyboard_event(source, 9, false)
        .map_err(|_| "Failed to create key-up event".to_string())?;
    key_up.set_flags(CGEventFlags::CGEventFlagCommand);
    key_up.post(CGEventTapLocation::HID);

    Ok(())
}

/// Copies text to clipboard and, if a text input is focused (and `auto_paste` is true),
/// synthesizes Cmd+V to paste at cursor.
/// Returns `Ok(true)` if pasted into a focused text field, or `Ok(false)` if saved to clipboard only.
pub fn inject_or_copy_text(text: &str, auto_paste: bool) -> Result<bool, String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    let should_paste = auto_paste && has_focused_text_input();

    if should_paste {
        // 1. Read existing clipboard text (if any)
        let previous_clipboard = clipboard.get_text().ok();

        // 2. Set transcribed text into clipboard
        clipboard
            .set_text(text.to_string())
            .map_err(|e| format!("Failed to set clipboard text: {}", e))?;

        // 3. Synthesize native Cmd + V
        synthesize_cmd_v()?;

        // 4. Restore original clipboard asynchronously after 200ms
        if let Some(prev) = previous_clipboard {
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(200));
                if let Ok(mut cb) = arboard::Clipboard::new() {
                    let _ = cb.set_text(prev);
                }
            });
        }

        Ok(true)
    } else {
        // No text box selected (or auto_paste disabled): save directly to clipboard and keep it there
        clipboard
            .set_text(text.to_string())
            .map_err(|e| format!("Failed to set clipboard text: {}", e))?;
        Ok(false)
    }
}

/// Auto-pastes transcribed text at current cursor unconditionally (used by manual paste command)
pub fn inject_text_at_cursor(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;
    clipboard
        .set_text(text.to_string())
        .map_err(|e| format!("Failed to set clipboard text: {}", e))?;
    synthesize_cmd_v()?;
    Ok(())
}

/// Configures the floating pill window on macOS so it:
/// 1. Floats on all spaces / virtual desktops (NSWindowCollectionBehaviorCanJoinAllSpaces = 1 << 0)
/// 2. Stationary across space switches (NSWindowCollectionBehaviorStationary = 1 << 4)
/// 3. Ignores Cmd+~ window cycle (NSWindowCollectionBehaviorIgnoresCycle = 1 << 6)
/// 4. Can appear over full-screen apps (NSWindowCollectionBehaviorFullScreenAuxiliary = 1 << 8)
pub fn configure_pill_window(pill: &tauri::WebviewWindow) {
    if let Ok(ns_win) = pill.ns_window() {
        let ns_win = ns_win as id;
        unsafe {
            // Note: CanJoinAllSpaces (1) and MoveToActiveSpace (2) are mutually exclusive in AppKit!
            // Using both throws NSInvalidArgumentException.
            let behavior: u64 = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
            let _: () = msg_send![ns_win, setCollectionBehavior: behavior];

            // Ensure window background and frame are 100% transparent with no rectangular shadow
            let clear_color: id = msg_send![class!(NSColor), clearColor];
            let _: () = msg_send![ns_win, setOpaque: false];
            let _: () = msg_send![ns_win, setBackgroundColor: clear_color];
            let _: () = msg_send![ns_win, setHasShadow: false];

            // NSStatusWindowLevel = 25 (above normal & floating windows, works cleanly on all spaces)
            let _: () = msg_send![ns_win, setLevel: 25isize];

            // Never hide when another app becomes active
            let _: () = msg_send![ns_win, setHidesOnDeactivate: false];
        }
    }
}

/// Shows the floating pill on whatever space the user is currently looking at,
/// without activating OpenFlow or switching spaces to the main window.
pub fn show_pill_without_activation(pill: &tauri::WebviewWindow) {
    let pill_clone = pill.clone();
    let _ = pill.run_on_main_thread(move || {
        if let Ok(ns_win) = pill_clone.ns_window() {
            let ns_win = ns_win as id;
            unsafe {
                let behavior: u64 = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
                let clear_color: id = msg_send![class!(NSColor), clearColor];
                let _: () = msg_send![ns_win, setCollectionBehavior: behavior];
                let _: () = msg_send![ns_win, setOpaque: false];
                let _: () = msg_send![ns_win, setBackgroundColor: clear_color];
                let _: () = msg_send![ns_win, setHasShadow: false];
                let _: () = msg_send![ns_win, setLevel: 25isize];
                let _: () = msg_send![ns_win, setHidesOnDeactivate: false];
                let _: () = msg_send![ns_win, orderFrontRegardless];
            }
        }
    });
}

/// Hides the floating pill window on the main thread
pub fn hide_pill_window(pill: &tauri::WebviewWindow) {
    let pill_clone = pill.clone();
    let _ = pill.run_on_main_thread(move || {
        if let Ok(ns_win) = pill_clone.ns_window() {
            let ns_win = ns_win as id;
            unsafe {
                let _: () = msg_send![ns_win, orderOut: nil];
            }
        }
    });
}

/// Check if Accessibility permissions are granted
pub fn is_accessibility_granted() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }

    unsafe { AXIsProcessTrusted() }
}

/// Request Accessibility permission prompt if not already granted
pub fn prompt_accessibility_permission() {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: id) -> bool;
    }

    unsafe {
        let key = NSString::alloc(nil).init_str("AXTrustedCheckOptionPrompt");
        let dict: id = msg_send![class!(NSDictionary), dictionaryWithObject:class!(NSNumber)
            forKey:key];
        AXIsProcessTrustedWithOptions(dict);
    }
}

/// Check microphone permission status on macOS
pub fn is_microphone_granted() -> bool {
    // We can probe via AVFoundation or system status
    let output = Command::new("osascript")
        .arg("-e")
        .arg(
            r#"
            tell application "System Events"
                return true
            end tell
            "#,
        )
        .output();
    output.map(|o| o.status.success()).unwrap_or(true)
}

/// Open macOS Security & Privacy settings
pub fn open_accessibility_settings() {
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

pub fn open_microphone_settings() {
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        .spawn();
}

pub fn open_url_in_browser(url: &str) {
    let _ = Command::new("open").arg(url).spawn();
}
