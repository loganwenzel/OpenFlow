use std::ffi::{c_void, CString};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub const K_MR_PLAY: u32 = 0;
pub const K_MR_PAUSE: u32 = 1;
pub const K_MR_TOGGLE_PLAY_PAUSE: u32 = 2;

#[repr(C)]
struct BlockDescriptor {
    reserved: std::os::raw::c_ulong,
    size: std::os::raw::c_ulong,
}

static BLOCK_DESCRIPTOR: BlockDescriptor = BlockDescriptor {
    reserved: 0,
    size: std::mem::size_of::<BlockLiteral>() as std::os::raw::c_ulong,
};

extern "C" {
    static _NSConcreteGlobalBlock: *const c_void;
    fn dispatch_get_global_queue(identifier: isize, flags: usize) -> *mut c_void;
}

#[repr(C)]
struct BlockLiteral {
    isa: *const c_void,
    flags: i32,
    reserved: i32,
    invoke: extern "C" fn(*mut BlockLiteral, bool),
    descriptor: *const BlockDescriptor,
    context: *const c_void,
}

struct MediaRemoteBindings {
    send_command: unsafe extern "C" fn(u32, *const c_void) -> bool,
    get_is_playing: unsafe extern "C" fn(*mut c_void, *const c_void),
}

fn get_media_remote() -> Option<&'static MediaRemoteBindings> {
    static CELL: std::sync::OnceLock<Option<MediaRemoteBindings>> = std::sync::OnceLock::new();
    CELL.get_or_init(|| {
        let path = CString::new("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote").unwrap();
        let handle = unsafe { libc::dlopen(path.as_ptr(), libc::RTLD_LAZY) };
        if handle.is_null() {
            return None;
        }

        let send_cmd_name = CString::new("MRMediaRemoteSendCommand").unwrap();
        let send_cmd_ptr = unsafe { libc::dlsym(handle, send_cmd_name.as_ptr()) };

        let is_playing_name = CString::new("MRMediaRemoteGetNowPlayingApplicationIsPlaying").unwrap();
        let is_playing_ptr = unsafe { libc::dlsym(handle, is_playing_name.as_ptr()) };

        if !send_cmd_ptr.is_null() && !is_playing_ptr.is_null() {
            Some(MediaRemoteBindings {
                send_command: unsafe {
                    std::mem::transmute::<*mut libc::c_void, unsafe extern "C" fn(u32, *const c_void) -> bool>(
                        send_cmd_ptr,
                    )
                },
                get_is_playing: unsafe {
                    std::mem::transmute::<*mut libc::c_void, unsafe extern "C" fn(*mut c_void, *const c_void)>(
                        is_playing_ptr,
                    )
                },
            })
        } else {
            None
        }
    })
    .as_ref()
}

struct BlockContext {
    state: Mutex<Option<bool>>,
    cvar: Condvar,
}

extern "C" fn block_invoke_callback(block: *mut BlockLiteral, is_playing: bool) {
    unsafe {
        let raw = (*block).context as *const BlockContext;
        if !raw.is_null() {
            let arc = Arc::from_raw(raw);
            if let Ok(mut guard) = arc.state.lock() {
                *guard = Some(is_playing);
                arc.cvar.notify_all();
            };
            drop(arc);
        }
    }
}

pub fn is_system_media_playing() -> bool {
    let Some(mr) = get_media_remote() else {
        return false;
    };

    let ctx = Arc::new(BlockContext {
        state: Mutex::new(None),
        cvar: Condvar::new(),
    });

    let raw = Arc::into_raw(ctx.clone()) as *const c_void;
    let isa = unsafe { &_NSConcreteGlobalBlock as *const _ as *const c_void };
    let block = BlockLiteral {
        isa,
        flags: 1 << 29, // BLOCK_IS_GLOBAL
        reserved: 0,
        invoke: block_invoke_callback,
        descriptor: &BLOCK_DESCRIPTOR,
        context: raw,
    };

    let queue = unsafe { dispatch_get_global_queue(0, 0) };
    unsafe {
        (mr.get_is_playing)(queue, &block as *const _ as *const c_void);
    }

    let mut guard = ctx.state.lock().unwrap();
    let timeout = Duration::from_millis(80);
    let start = Instant::now();
    while guard.is_none() && start.elapsed() < timeout {
        let remaining = timeout.saturating_sub(start.elapsed());
        let result = ctx.cvar.wait_timeout(guard, remaining).unwrap();
        guard = result.0;
    }

    guard.unwrap_or(false)
}

pub fn send_media_remote_command(cmd: u32) -> bool {
    if let Some(mr) = get_media_remote() {
        unsafe { (mr.send_command)(cmd, std::ptr::null()) }
    } else {
        false
    }
}

fn is_process_running(name: &str) -> bool {
    Command::new("pgrep")
        .arg("-x")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn is_spotify_playing() -> bool {
    if !is_process_running("Spotify") {
        return false;
    }
    let output = Command::new("osascript")
        .args(["-e", r#"tell application "Spotify" to player state as string"#])
        .output();
    if let Ok(out) = output {
        String::from_utf8_lossy(&out.stdout).trim() == "playing"
    } else {
        false
    }
}

pub fn is_apple_music_playing() -> bool {
    if !is_process_running("Music") {
        return false;
    }
    let output = Command::new("osascript")
        .args(["-e", r#"tell application "Music" to player state as string"#])
        .output();
    if let Ok(out) = output {
        String::from_utf8_lossy(&out.stdout).trim() == "playing"
    } else {
        false
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct MediaPauseSnapshot {
    pub system_media_was_playing: bool,
    pub spotify_was_playing: bool,
    pub music_was_playing: bool,
}

static CURRENT_PAUSE_SNAPSHOT: Mutex<Option<MediaPauseSnapshot>> = Mutex::new(None);
static RESUME_CANCEL: AtomicBool = AtomicBool::new(false);

/// Automatically pauses active media playback (Spotify, Apple Music, YouTube in browsers, etc.)
/// before dictation starts, recording which player was active.
pub fn pause_media_playback() {
    RESUME_CANCEL.store(true, Ordering::SeqCst);

    let system_playing = is_system_media_playing();
    let spotify_playing = is_spotify_playing();
    let music_playing = is_apple_music_playing();

    if !system_playing && !spotify_playing && !music_playing {
        let mut guard = CURRENT_PAUSE_SNAPSHOT.lock().unwrap();
        *guard = None;
        return;
    }

    let snapshot = MediaPauseSnapshot {
        system_media_was_playing: system_playing,
        spotify_was_playing: spotify_playing,
        music_was_playing: music_playing,
    };

    {
        let mut guard = CURRENT_PAUSE_SNAPSHOT.lock().unwrap();
        *guard = Some(snapshot);
    }

    // Always send kMRPause to pause any active system media / video
    if system_playing {
        send_media_remote_command(K_MR_PAUSE);
    }

    // Explicitly pause Spotify if it was playing
    if spotify_playing {
        thread::spawn(|| {
            let _ = Command::new("osascript")
                .args(["-e", r#"tell application "Spotify" to pause"#])
                .output();
        });
    }

    // Explicitly pause Music if it was playing
    if music_playing {
        thread::spawn(|| {
            let _ = Command::new("osascript")
                .args(["-e", r#"tell application "Music" to pause"#])
                .output();
        });
    }
}

/// Smoothly resumes media playback if it was paused when dictation started.
pub fn resume_media_playback() {
    let snapshot = {
        let mut guard = CURRENT_PAUSE_SNAPSHOT.lock().unwrap();
        guard.take()
    };

    let Some(snapshot) = snapshot else {
        return;
    };

    RESUME_CANCEL.store(false, Ordering::SeqCst);

    thread::spawn(move || {
        // Wait 300ms to allow native text injection to complete and Bluetooth
        // headphones to cleanly transition from HFP (recording) back to A2DP (stereo music)
        thread::sleep(Duration::from_millis(300));
        if RESUME_CANCEL.load(Ordering::SeqCst) {
            return;
        }

        if snapshot.spotify_was_playing {
            let _ = Command::new("osascript")
                .args(["-e", r#"tell application "Spotify" to play"#])
                .output();
        } else if snapshot.music_was_playing {
            let _ = Command::new("osascript")
                .args(["-e", r#"tell application "Music" to play"#])
                .output();
        } else if snapshot.system_media_was_playing {
            send_media_remote_command(K_MR_PLAY);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_system_media_playing() {
        let is_playing = is_system_media_playing();
        println!("is_system_media_playing: {}", is_playing);
    }

    #[test]
    fn test_pause_and_resume_cycle() {
        // Test that pause captures snapshot and resume clears snapshot
        pause_media_playback();
        let was_captured = {
            let guard = CURRENT_PAUSE_SNAPSHOT.lock().unwrap();
            guard.is_some()
        };
        resume_media_playback();
        let is_cleared = {
            let guard = CURRENT_PAUSE_SNAPSHOT.lock().unwrap();
            guard.is_none()
        };
        assert!(is_cleared);
        println!("Pause captured snapshot: {}, resume cleared snapshot: {}", was_captured, is_cleared);
    }
}
