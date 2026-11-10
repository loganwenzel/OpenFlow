use std::collections::HashSet;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

pub struct HotkeyConfig {
    pub key_name: String, // "Left Control (⌃) + Left Shift (⇧)", etc.
    pub keycode: Option<i64>,
    pub keycodes: Vec<i64>,
    pub is_push_to_talk: bool,
}

// macOS CGEvent Constants
const K_CG_SESSION_EVENT_TAP: u32 = 1;
const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;

const K_CG_EVENT_KEY_DOWN: u32 = 10;
const K_CG_EVENT_KEY_UP: u32 = 11;
const K_CG_EVENT_FLAGS_CHANGED: u32 = 12;
const K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT: u32 = 0xFFFFFFFE;
const K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT: u32 = 0xFFFFFFFF;

const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;

// macOS Keycode Constants
const KEYCODE_RIGHT_OPTION: i64 = 61;
const KEYCODE_LEFT_OPTION: i64 = 58;
const KEYCODE_RIGHT_CONTROL: i64 = 62;
const KEYCODE_LEFT_CONTROL: i64 = 59;
const KEYCODE_RIGHT_SHIFT: i64 = 60;
const KEYCODE_LEFT_SHIFT: i64 = 56;
const KEYCODE_FN: i64 = 63;
const KEYCODE_F8: i64 = 100;
const KEYCODE_F7: i64 = 98;
const KEYCODE_F9: i64 = 101;

// Modifier Flag Masks
const FLAG_MASK_ALTERNATE: u64 = 0x00080000;
const FLAG_MASK_CONTROL: u64 = 0x00040000;
const FLAG_MASK_SHIFT: u64 = 0x00020000;
const FLAG_MASK_FN: u64 = 0x00800000;

type CGEventRef = *mut c_void;
type CGEventTapProxy = *mut c_void;
type CFMachPortRef = *mut c_void;
type CFRunLoopSourceRef = *mut c_void;

type CGEventTapCallback = extern "C" fn(
    proxy: CGEventTapProxy,
    event_type: u32,
    event: CGEventRef,
    refcon: *mut c_void,
) -> CGEventRef;

#[allow(clippy::duplicated_attributes)]
#[link(name = "CoreGraphics", kind = "framework")]
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: CGEventTapCallback,
        refcon: *mut c_void,
    ) -> CFMachPortRef;

    fn CFMachPortCreateRunLoopSource(
        allocator: *const c_void,
        port: CFMachPortRef,
        order: isize,
    ) -> CFRunLoopSourceRef;

    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);

    fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    fn CGEventGetFlags(event: CGEventRef) -> u64;

    fn CFRunLoopGetCurrent() -> *mut c_void;
    fn CFRunLoopAddSource(rl: *mut c_void, source: CFRunLoopSourceRef, mode: *const c_void);
    fn CFRunLoopRun();
    fn CFRelease(cf: *mut c_void);

    static kCFRunLoopCommonModes: *const c_void;
}

struct TapContext {
    get_config: Box<dyn Fn() -> HotkeyConfig + Send + Sync>,
    on_start: Arc<dyn Fn() + Send + Sync>,
    on_stop: Arc<dyn Fn() + Send + Sync>,
    is_holding: Arc<AtomicBool>,
    is_recording: Arc<AtomicBool>,
    pressed_keys: Mutex<HashSet<i64>>,
    port: Mutex<Option<CFMachPortRef>>,
}

extern "C" fn event_tap_callback(
    _proxy: CGEventTapProxy,
    event_type: u32,
    event: CGEventRef,
    refcon: *mut c_void,
) -> CGEventRef {
    if refcon.is_null() {
        return event;
    }

    let ctx = unsafe { &*(refcon as *mut TapContext) };

    // Auto re-enable tap if disabled by timeout or user input
    if event_type == K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT
        || event_type == K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT
    {
        if let Ok(guard) = ctx.port.lock() {
            if let Some(port) = *guard {
                unsafe { CGEventTapEnable(port, true) };
            }
        }
        return event;
    }

    if event.is_null() {
        return event;
    }

    let keycode = unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };
    let flags = unsafe { CGEventGetFlags(event) };
    let config = (ctx.get_config)();

    let target_keycodes: Vec<i64> = if !config.keycodes.is_empty() {
        config.keycodes.clone()
    } else if let Some(kc) = config.keycode {
        vec![kc]
    } else {
        let single = match config.key_name.as_str() {
            "LeftOption" => KEYCODE_LEFT_OPTION,
            "Fn" | "Function" => KEYCODE_FN,
            "RightControl" => KEYCODE_RIGHT_CONTROL,
            "LeftControl" => KEYCODE_LEFT_CONTROL,
            "RightShift" => KEYCODE_RIGHT_SHIFT,
            "LeftShift" => KEYCODE_LEFT_SHIFT,
            "F7" => KEYCODE_F7,
            "F8" => KEYCODE_F8,
            "F9" => KEYCODE_F9,
            _ => KEYCODE_RIGHT_OPTION,
        };
        vec![single]
    };

    let all_down = {
        let mut pressed = match ctx.pressed_keys.lock() {
            Ok(g) => g,
            Err(_) => return event,
        };

        // Clear any modifier keycodes whose modifier group flag is completely off
        if (flags & FLAG_MASK_ALTERNATE) == 0 {
            pressed.remove(&KEYCODE_LEFT_OPTION);
            pressed.remove(&KEYCODE_RIGHT_OPTION);
        }
        if (flags & FLAG_MASK_CONTROL) == 0 {
            pressed.remove(&KEYCODE_LEFT_CONTROL);
            pressed.remove(&KEYCODE_RIGHT_CONTROL);
        }
        if (flags & FLAG_MASK_SHIFT) == 0 {
            pressed.remove(&KEYCODE_LEFT_SHIFT);
            pressed.remove(&KEYCODE_RIGHT_SHIFT);
        }
        if (flags & 0x00100000) == 0 {
            pressed.remove(&54);
            pressed.remove(&55);
        }
        if (flags & FLAG_MASK_FN) == 0 {
            pressed.remove(&KEYCODE_FN);
        }
        if (flags & 0x00010000) == 0 {
            pressed.remove(&57);
        }

        match event_type {
            K_CG_EVENT_FLAGS_CHANGED => {
                let is_mod_down = match keycode {
                    KEYCODE_LEFT_CONTROL => {
                        (flags & FLAG_MASK_CONTROL) != 0
                            && ((flags & 0x0001) != 0 || !pressed.contains(&keycode))
                    }
                    KEYCODE_RIGHT_CONTROL => {
                        (flags & FLAG_MASK_CONTROL) != 0
                            && ((flags & 0x2000) != 0 || !pressed.contains(&keycode))
                    }
                    KEYCODE_LEFT_SHIFT => {
                        (flags & FLAG_MASK_SHIFT) != 0
                            && ((flags & 0x0002) != 0 || !pressed.contains(&keycode))
                    }
                    KEYCODE_RIGHT_SHIFT => {
                        (flags & FLAG_MASK_SHIFT) != 0
                            && ((flags & 0x0004) != 0 || !pressed.contains(&keycode))
                    }
                    55 => {
                        (flags & 0x00100000) != 0
                            && ((flags & 0x0008) != 0 || !pressed.contains(&keycode))
                    }
                    54 => {
                        (flags & 0x00100000) != 0
                            && ((flags & 0x0010) != 0 || !pressed.contains(&keycode))
                    }
                    KEYCODE_LEFT_OPTION => {
                        (flags & FLAG_MASK_ALTERNATE) != 0
                            && ((flags & 0x0020) != 0 || !pressed.contains(&keycode))
                    }
                    KEYCODE_RIGHT_OPTION => {
                        (flags & FLAG_MASK_ALTERNATE) != 0
                            && ((flags & 0x0040) != 0 || !pressed.contains(&keycode))
                    }
                    KEYCODE_FN => (flags & FLAG_MASK_FN) != 0,
                    57 => (flags & 0x00010000) != 0,
                    _ => false,
                };
                if is_mod_down {
                    pressed.insert(keycode);
                } else {
                    pressed.remove(&keycode);
                }
            }
            K_CG_EVENT_KEY_DOWN => {
                pressed.insert(keycode);
            }
            K_CG_EVENT_KEY_UP => {
                pressed.remove(&keycode);
            }
            _ => {}
        }

        !target_keycodes.is_empty() && target_keycodes.iter().all(|k| pressed.contains(k))
    };

    if all_down {
        if !ctx.is_holding.swap(true, Ordering::SeqCst) {
            if config.is_push_to_talk {
                ctx.is_recording.store(true, Ordering::SeqCst);
                (ctx.on_start)();
            } else {
                let was_recording = ctx.is_recording.load(Ordering::SeqCst);
                if was_recording {
                    ctx.is_recording.store(false, Ordering::SeqCst);
                    (ctx.on_stop)();
                } else {
                    ctx.is_recording.store(true, Ordering::SeqCst);
                    (ctx.on_start)();
                }
            }
        }
    } else if ctx.is_holding.swap(false, Ordering::SeqCst) && config.is_push_to_talk {
        ctx.is_recording.store(false, Ordering::SeqCst);
        (ctx.on_stop)();
    }

    event
}

pub fn start_hotkey_listener<FStart, FStop>(
    get_config: impl Fn() -> HotkeyConfig + Send + Sync + 'static,
    on_start: FStart,
    on_stop: FStop,
) where
    FStart: Fn() + Send + Sync + 'static,
    FStop: Fn() + Send + Sync + 'static,
{
    thread::spawn(move || {
        let context = Box::new(TapContext {
            get_config: Box::new(get_config),
            on_start: Arc::new(on_start),
            on_stop: Arc::new(on_stop),
            is_holding: Arc::new(AtomicBool::new(false)),
            is_recording: Arc::new(AtomicBool::new(false)),
            pressed_keys: Mutex::new(HashSet::new()),
            port: Mutex::new(None),
        });

        let context_ptr = Box::into_raw(context);

        // Listen for KeyDown, KeyUp, and FlagsChanged (modifier keys)
        let full_mask: u64 = (1 << K_CG_EVENT_KEY_DOWN)
            | (1 << K_CG_EVENT_KEY_UP)
            | (1 << K_CG_EVENT_FLAGS_CHANGED);
        let flags_only_mask: u64 = 1 << K_CG_EVENT_FLAGS_CHANGED;

        unsafe {
            let tap = loop {
                let mut t = CGEventTapCreate(
                    K_CG_SESSION_EVENT_TAP,
                    K_CG_HEAD_INSERT_EVENT_TAP,
                    K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                    full_mask,
                    event_tap_callback,
                    context_ptr as *mut c_void,
                );

                if t.is_null() {
                    // Fallback to FlagsChanged-only tap (works for modifier keys/chords even without Input Monitoring)
                    t = CGEventTapCreate(
                        K_CG_SESSION_EVENT_TAP,
                        K_CG_HEAD_INSERT_EVENT_TAP,
                        K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                        flags_only_mask,
                        event_tap_callback,
                        context_ptr as *mut c_void,
                    );
                }

                if !t.is_null() {
                    eprintln!("[OpenFlow] Global hotkey event tap started successfully.");
                    break t;
                }

                eprintln!("[OpenFlow] Waiting for Accessibility/Input Monitoring permission for global hotkey tap...");
                thread::sleep(std::time::Duration::from_secs(2));
            };

            if let Ok(mut guard) = (*context_ptr).port.lock() {
                *guard = Some(tap);
            }

            let source = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
            if source.is_null() {
                CFRelease(tap);
                return;
            }

            let run_loop = CFRunLoopGetCurrent();
            CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
            CFRunLoopRun();

            CFRelease(source);
            CFRelease(tap);
        }
    });
}
