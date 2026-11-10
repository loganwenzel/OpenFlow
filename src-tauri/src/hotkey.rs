use std::collections::HashSet;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

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
    fn CFRunLoopStop(rl: *mut c_void);
    fn CFRelease(cf: *mut c_void);

    static kCFRunLoopCommonModes: *const c_void;
}

static GLOBAL_HANDS_FREE_LOCKED: AtomicBool = AtomicBool::new(false);
static GLOBAL_IS_RECORDING: AtomicBool = AtomicBool::new(false);
static GLOBAL_IS_HOLDING: AtomicBool = AtomicBool::new(false);

pub fn reset_hotkey_state() {
    GLOBAL_HANDS_FREE_LOCKED.store(false, Ordering::SeqCst);
    GLOBAL_IS_RECORDING.store(false, Ordering::SeqCst);
    GLOBAL_IS_HOLDING.store(false, Ordering::SeqCst);
}

pub fn is_hands_free_locked() -> bool {
    GLOBAL_HANDS_FREE_LOCKED.load(Ordering::SeqCst)
}

struct TapContext {
    get_config: Box<dyn Fn() -> HotkeyConfig + Send + Sync>,
    on_start: Arc<dyn Fn() + Send + Sync>,
    on_stop: Arc<dyn Fn() + Send + Sync>,
    press_start_time: Mutex<Option<Instant>>,
    last_release_time: Mutex<Option<Instant>>,
    pressed_keys: Mutex<HashSet<i64>>,
    port: Mutex<Option<CFMachPortRef>>,
    current_press_id: Arc<AtomicU64>,
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

        match event_type {
            K_CG_EVENT_FLAGS_CHANGED => {
                // Shift keys (56 = Left Shift, 60 = Right Shift)
                if (flags & FLAG_MASK_SHIFT) != 0 {
                    let has_sub = (flags & 0x0006) != 0;
                    if (flags & 0x0002) != 0
                        || keycode == KEYCODE_LEFT_SHIFT
                        || (!has_sub && target_keycodes.contains(&KEYCODE_LEFT_SHIFT))
                    {
                        pressed.insert(KEYCODE_LEFT_SHIFT);
                    } else if has_sub {
                        pressed.remove(&KEYCODE_LEFT_SHIFT);
                    }

                    if (flags & 0x0004) != 0
                        || keycode == KEYCODE_RIGHT_SHIFT
                        || (!has_sub && target_keycodes.contains(&KEYCODE_RIGHT_SHIFT))
                    {
                        pressed.insert(KEYCODE_RIGHT_SHIFT);
                    } else if has_sub {
                        pressed.remove(&KEYCODE_RIGHT_SHIFT);
                    }
                } else {
                    pressed.remove(&KEYCODE_LEFT_SHIFT);
                    pressed.remove(&KEYCODE_RIGHT_SHIFT);
                }

                // Control keys (59 = Left Control, 62 = Right Control)
                if (flags & FLAG_MASK_CONTROL) != 0 {
                    let has_sub = (flags & 0x2001) != 0;
                    if (flags & 0x0001) != 0
                        || keycode == KEYCODE_LEFT_CONTROL
                        || (!has_sub && target_keycodes.contains(&KEYCODE_LEFT_CONTROL))
                    {
                        pressed.insert(KEYCODE_LEFT_CONTROL);
                    } else if has_sub {
                        pressed.remove(&KEYCODE_LEFT_CONTROL);
                    }

                    if (flags & 0x2000) != 0
                        || keycode == KEYCODE_RIGHT_CONTROL
                        || (!has_sub && target_keycodes.contains(&KEYCODE_RIGHT_CONTROL))
                    {
                        pressed.insert(KEYCODE_RIGHT_CONTROL);
                    } else if has_sub {
                        pressed.remove(&KEYCODE_RIGHT_CONTROL);
                    }
                } else {
                    pressed.remove(&KEYCODE_LEFT_CONTROL);
                    pressed.remove(&KEYCODE_RIGHT_CONTROL);
                }

                // Option/Alt keys (58 = Left Option, 61 = Right Option)
                if (flags & FLAG_MASK_ALTERNATE) != 0 {
                    let has_sub = (flags & 0x0060) != 0;
                    if (flags & 0x0020) != 0
                        || keycode == KEYCODE_LEFT_OPTION
                        || (!has_sub && target_keycodes.contains(&KEYCODE_LEFT_OPTION))
                    {
                        pressed.insert(KEYCODE_LEFT_OPTION);
                    } else if has_sub {
                        pressed.remove(&KEYCODE_LEFT_OPTION);
                    }

                    if (flags & 0x0040) != 0
                        || keycode == KEYCODE_RIGHT_OPTION
                        || (!has_sub && target_keycodes.contains(&KEYCODE_RIGHT_OPTION))
                    {
                        pressed.insert(KEYCODE_RIGHT_OPTION);
                    } else if has_sub {
                        pressed.remove(&KEYCODE_RIGHT_OPTION);
                    }
                } else {
                    pressed.remove(&KEYCODE_LEFT_OPTION);
                    pressed.remove(&KEYCODE_RIGHT_OPTION);
                }

                // Command keys (55 = Left Command, 54 = Right Command)
                if (flags & 0x00100000) != 0 {
                    let has_sub = (flags & 0x0018) != 0;
                    if (flags & 0x0008) != 0
                        || keycode == 55
                        || (!has_sub && target_keycodes.contains(&55))
                    {
                        pressed.insert(55);
                    } else if has_sub {
                        pressed.remove(&55);
                    }

                    if (flags & 0x0010) != 0
                        || keycode == 54
                        || (!has_sub && target_keycodes.contains(&54))
                    {
                        pressed.insert(54);
                    } else if has_sub {
                        pressed.remove(&54);
                    }
                } else {
                    pressed.remove(&55);
                    pressed.remove(&54);
                }

                // Fn key (63)
                if (flags & FLAG_MASK_FN) != 0 {
                    pressed.insert(KEYCODE_FN);
                } else {
                    pressed.remove(&KEYCODE_FN);
                }

                // Caps Lock key (57)
                if (flags & 0x00010000) != 0 {
                    pressed.insert(57);
                } else {
                    pressed.remove(&57);
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
        if !GLOBAL_IS_HOLDING.swap(true, Ordering::SeqCst) {
            let now = Instant::now();
            {
                let mut guard = ctx.press_start_time.lock().unwrap();
                *guard = Some(now);
            }

            ctx.current_press_id.fetch_add(1, Ordering::SeqCst);

            let last_release = {
                let guard = ctx.last_release_time.lock().unwrap();
                *guard
            };

            let is_double_tap = if let Some(last_rel) = last_release {
                now.duration_since(last_rel).as_millis() <= 380
            } else {
                false
            };

            let is_currently_locked = GLOBAL_HANDS_FREE_LOCKED.load(Ordering::SeqCst);

            if is_currently_locked {
                // In hands-free mode: pressing hotkey again stops hands-free immediately!
                GLOBAL_HANDS_FREE_LOCKED.store(false, Ordering::SeqCst);
                GLOBAL_IS_RECORDING.store(false, Ordering::SeqCst);
                (ctx.on_stop)();
            } else if is_double_tap {
                // Double tap detected! Lock into hands-free mode immediately!
                GLOBAL_HANDS_FREE_LOCKED.store(true, Ordering::SeqCst);
                GLOBAL_IS_RECORDING.store(true, Ordering::SeqCst);
                (ctx.on_start)();
            } else {
                // First press: pop up immediately with ZERO delay!
                GLOBAL_HANDS_FREE_LOCKED.store(false, Ordering::SeqCst);
                GLOBAL_IS_RECORDING.store(true, Ordering::SeqCst);
                (ctx.on_start)();
            }
        }
    } else if GLOBAL_IS_HOLDING.swap(false, Ordering::SeqCst) {
        let now = Instant::now();
        let press_start = {
            let guard = ctx.press_start_time.lock().unwrap();
            *guard
        };
        {
            let mut guard = ctx.last_release_time.lock().unwrap();
            *guard = Some(now);
        }

        let is_locked = GLOBAL_HANDS_FREE_LOCKED.load(Ordering::SeqCst);

        if !is_locked {
            let held_duration_ms = press_start
                .map(|t| now.duration_since(t).as_millis())
                .unwrap_or(300);

            if held_duration_ms >= 200 {
                // Normal hold-to-talk (held >= 200ms): release stops recording immediately!
                GLOBAL_IS_RECORDING.store(false, Ordering::SeqCst);
                (ctx.on_stop)();
            } else {
                // Quick tap (< 200ms): might be the first tap of a double tap.
                // Wait 350ms. If no second tap arrives, stop recording!
                let stop_id = ctx.current_press_id.fetch_add(1, Ordering::SeqCst) + 1;
                let press_id_arc = Arc::clone(&ctx.current_press_id);
                let on_stop_cb = Arc::clone(&ctx.on_stop);

                thread::spawn(move || {
                    thread::sleep(std::time::Duration::from_millis(350));
                    if press_id_arc.load(Ordering::SeqCst) == stop_id
                        && !GLOBAL_HANDS_FREE_LOCKED.load(Ordering::SeqCst)
                    {
                        GLOBAL_IS_RECORDING.store(false, Ordering::SeqCst);
                        on_stop_cb();
                    }
                });
            }
        }
    }

    event
}

static TAP_ACTIVE: AtomicBool = AtomicBool::new(false);
static TAP_ACTIVE_WITH_AX: AtomicBool = AtomicBool::new(false);
static CURRENT_RUN_LOOP: Mutex<Option<usize>> = Mutex::new(None);

pub fn is_tap_active() -> bool {
    TAP_ACTIVE.load(Ordering::SeqCst)
}

pub fn can_create_event_tap() -> bool {
    if is_tap_active() {
        return true;
    }
    let flags_only_mask: u64 = 1 << K_CG_EVENT_FLAGS_CHANGED;
    unsafe {
        let tap = CGEventTapCreate(
            K_CG_SESSION_EVENT_TAP,
            K_CG_HEAD_INSERT_EVENT_TAP,
            K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
            flags_only_mask,
            event_tap_callback,
            std::ptr::null_mut(),
        );
        if !tap.is_null() {
            CFRelease(tap);
            true
        } else {
            false
        }
    }
}

pub fn refresh_hotkey_listener_if_needed() {
    let has_ax = crate::macos::is_accessibility_granted();
    let was_ax = TAP_ACTIVE_WITH_AX.load(Ordering::SeqCst);
    if has_ax && !was_ax {
        eprintln!("[OpenFlow] Accessibility newly granted! Refreshing global event tap...");
        if let Ok(guard) = CURRENT_RUN_LOOP.lock() {
            if let Some(rl_ptr) = *guard {
                unsafe {
                    CFRunLoopStop(rl_ptr as *mut c_void);
                }
            }
        }
    }
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
            press_start_time: Mutex::new(None),
            last_release_time: Mutex::new(None),
            pressed_keys: Mutex::new(HashSet::new()),
            port: Mutex::new(None),
            current_press_id: Arc::new(AtomicU64::new(0)),
        });

        let context_ptr = Box::into_raw(context);

        // Listen for KeyDown, KeyUp, and FlagsChanged (modifier keys)
        let full_mask: u64 = (1 << K_CG_EVENT_KEY_DOWN)
            | (1 << K_CG_EVENT_KEY_UP)
            | (1 << K_CG_EVENT_FLAGS_CHANGED);
        let flags_only_mask: u64 = 1 << K_CG_EVENT_FLAGS_CHANGED;

        unsafe {
            loop {
                let has_ax = crate::macos::is_accessibility_granted();
                TAP_ACTIVE_WITH_AX.store(has_ax, Ordering::SeqCst);

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
                        eprintln!("[OpenFlow] Global hotkey event tap started (Accessibility={}).", has_ax);
                        TAP_ACTIVE.store(true, Ordering::SeqCst);
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
                    TAP_ACTIVE.store(false, Ordering::SeqCst);
                    CFRelease(tap);
                    return;
                }

                let run_loop = CFRunLoopGetCurrent();
                if let Ok(mut guard) = CURRENT_RUN_LOOP.lock() {
                    *guard = Some(run_loop as usize);
                }

                CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
                CGEventTapEnable(tap, true);
                CFRunLoopRun();

                TAP_ACTIVE.store(false, Ordering::SeqCst);

                if let Ok(mut guard) = CURRENT_RUN_LOOP.lock() {
                    *guard = None;
                }

                CFRelease(source);
                CFRelease(tap);

                // Small pause before re-creating tap if loop was restarted
                thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    });
}
