use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{WavSpec, WavWriter};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

enum AudioCommand {
    Start {
        device_name: Option<String>,
        on_rms: Arc<dyn Fn(f32) + Send + Sync + 'static>,
        resp: Sender<Result<(), String>>,
    },
    Stop {
        resp: Sender<Result<(Vec<u8>, u32), String>>,
    },
    Cancel,
    ListDevices {
        resp: Sender<Vec<String>>,
    },
}

#[derive(Clone)]
pub struct AudioRecorder {
    tx: Sender<AudioCommand>,
    is_recording_flag: Arc<AtomicBool>,
}

impl Default for AudioRecorder {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioRecorder {
    pub fn new() -> Self {
        let (tx, rx) = channel::<AudioCommand>();
        let is_recording_flag = Arc::new(AtomicBool::new(false));
        let flag_clone = Arc::clone(&is_recording_flag);

        // Dedicated audio thread to ensure cpal::Stream stays on a single thread
        thread::spawn(move || {
            let mut _active_stream: Option<cpal::Stream> = None;
            let mut current_buffer: Option<Arc<std::sync::Mutex<Vec<i16>>>> = None;
            let mut source_sample_rate = 16000u32;
            let mut start_time: Option<Instant> = None;

            while let Ok(cmd) = rx.recv() {
                match cmd {
                    AudioCommand::Start {
                        device_name,
                        on_rms,
                        resp,
                    } => {
                        let host = cpal::default_host();
                        let device = match device_name {
                            Some(name) if name != "default" => host
                                .input_devices()
                                .ok()
                                .and_then(|mut devs| {
                                    devs.find(|d| d.name().map(|n| n == name).unwrap_or(false))
                                })
                                .or_else(|| host.default_input_device()),
                            _ => host.default_input_device(),
                        };

                        let device = match device {
                            Some(d) => d,
                            None => {
                                let _ = resp.send(Err("No audio input device found".to_string()));
                                continue;
                            }
                        };

                        let config = match device.default_input_config() {
                            Ok(c) => c,
                            Err(e) => {
                                let _ = resp.send(Err(format!("Input config error: {}", e)));
                                continue;
                            }
                        };

                        source_sample_rate = config.sample_rate().0;
                        let channels = config.channels();
                        start_time = Some(Instant::now());

                        let buffer_arc = Arc::new(std::sync::Mutex::new(Vec::new()));
                        let buf_for_stream = Arc::clone(&buffer_arc);
                        current_buffer = Some(Arc::clone(&buffer_arc));
                        let on_rms_cb = Arc::clone(&on_rms);

                        let err_fn = |err| eprintln!("Audio stream error: {}", err);

                        let rms_window_samples = (source_sample_rate as usize / 35).max(512);
                        let stream_result = match config.sample_format() {
                            cpal::SampleFormat::F32 => {
                                let on_rms_cb = Arc::clone(&on_rms_cb);
                                let mut acc_sq = 0.0f32;
                                let mut acc_count = 0usize;
                                device.build_input_stream(
                                    &config.into(),
                                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                                        let mut buf = buf_for_stream.lock().unwrap();

                                        for frame in data.chunks(channels as usize) {
                                            let mono_sample = if channels > 1 {
                                                frame.iter().sum::<f32>() / channels as f32
                                            } else {
                                                frame[0]
                                            };

                                            acc_sq += mono_sample * mono_sample;
                                            acc_count += 1;

                                            let clamped = mono_sample.clamp(-1.0, 1.0);
                                            let sample_i16 = (clamped * 32767.0) as i16;
                                            buf.push(sample_i16);
                                        }

                                        if acc_count >= rms_window_samples {
                                            let rms = (acc_sq / acc_count as f32).sqrt();
                                            let active = (rms - 0.0015).max(0.0);
                                            let norm_rms = (active * 18.0).powf(0.55).clamp(0.0, 1.0);
                                            on_rms_cb(norm_rms);
                                            acc_sq = 0.0;
                                            acc_count = 0;
                                        }
                                    },
                                    err_fn,
                                    None,
                                )
                            }
                            cpal::SampleFormat::I16 => {
                                let on_rms_cb = Arc::clone(&on_rms_cb);
                                let mut acc_sq = 0.0f32;
                                let mut acc_count = 0usize;
                                device.build_input_stream(
                                    &config.into(),
                                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                                        let mut buf = buf_for_stream.lock().unwrap();

                                        for frame in data.chunks(channels as usize) {
                                            let mono_sample = if channels > 1 {
                                                (frame.iter().map(|&s| s as i32).sum::<i32>()
                                                    / channels as i32)
                                                    as i16
                                            } else {
                                                frame[0]
                                            };

                                            let f = mono_sample as f32 / 32768.0;
                                            acc_sq += f * f;
                                            acc_count += 1;
                                            buf.push(mono_sample);
                                        }

                                        if acc_count >= rms_window_samples {
                                            let rms = (acc_sq / acc_count as f32).sqrt();
                                            let active = (rms - 0.0015).max(0.0);
                                            let norm_rms = (active * 18.0).powf(0.55).clamp(0.0, 1.0);
                                            on_rms_cb(norm_rms);
                                            acc_sq = 0.0;
                                            acc_count = 0;
                                        }
                                    },
                                    err_fn,
                                    None,
                                )
                            }
                            other => {
                                let _ = resp.send(Err(format!("Unsupported audio format: {:?}", other)));
                                continue;
                            }
                        };

                        match stream_result {
                            Ok(stream) => {
                                if let Err(e) = stream.play() {
                                    let _ = resp.send(Err(format!("Failed to play stream: {}", e)));
                                    continue;
                                }
                                _active_stream = Some(stream);
                                flag_clone.store(true, Ordering::SeqCst);
                                let _ = resp.send(Ok(()));
                            }
                            Err(e) => {
                                let _ = resp.send(Err(format!("Failed to build input stream: {}", e)));
                            }
                        }
                    }
                    AudioCommand::Stop { resp } => {
                        flag_clone.store(false, Ordering::SeqCst);
                        _active_stream = None;

                        let duration_ms = start_time
                            .map(|t| t.elapsed().as_millis() as u32)
                            .unwrap_or(0);

                        let audio_samples = current_buffer
                            .take()
                            .map(|b| b.lock().unwrap().clone())
                            .unwrap_or_default();

                        if audio_samples.is_empty() {
                            let _ = resp.send(Err("No audio frames recorded".to_string()));
                            continue;
                        }

                        // Resample to 16kHz mono WAV
                        let target_rate = 16000;
                        let resampled = resample_linear(&audio_samples, source_sample_rate, target_rate);

                        let spec = WavSpec {
                            channels: 1,
                            sample_rate: target_rate,
                            bits_per_sample: 16,
                            sample_format: hound::SampleFormat::Int,
                        };

                        let mut cursor = Cursor::new(Vec::new());
                        let write_res = WavWriter::new(&mut cursor, spec).and_then(|mut writer| {
                            for &s in &resampled {
                                writer.write_sample(s)?;
                            }
                            writer.finalize()
                        });

                        match write_res {
                            Ok(_) => {
                                let _ = resp.send(Ok((cursor.into_inner(), duration_ms)));
                            }
                            Err(e) => {
                                let _ = resp.send(Err(format!("WAV encoding error: {}", e)));
                            }
                        }
                    }
                    AudioCommand::Cancel => {
                        flag_clone.store(false, Ordering::SeqCst);
                        _active_stream = None;
                        current_buffer = None;
                    }
                    AudioCommand::ListDevices { resp } => {
                        let host = cpal::default_host();
                        let mut devices = Vec::new();
                        if let Ok(input_devices) = host.input_devices() {
                            for dev in input_devices {
                                if let Ok(name) = dev.name() {
                                    devices.push(name);
                                }
                            }
                        }
                        let _ = resp.send(devices);
                    }
                }
            }
        });

        Self {
            tx,
            is_recording_flag,
        }
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording_flag.load(Ordering::SeqCst)
    }

    pub fn list_devices(&self) -> Vec<String> {
        let (resp_tx, resp_rx) = channel();
        if self.tx.send(AudioCommand::ListDevices { resp: resp_tx }).is_ok() {
            resp_rx.recv().unwrap_or_default()
        } else {
            Vec::new()
        }
    }

    pub fn start_recording<F>(
        &self,
        device_name: Option<String>,
        on_rms: F,
    ) -> Result<(), String>
    where
        F: Fn(f32) + Send + Sync + 'static,
    {
        if self.is_recording() {
            return Ok(());
        }

        let (resp_tx, resp_rx) = channel();
        self.tx
            .send(AudioCommand::Start {
                device_name,
                on_rms: Arc::new(on_rms),
                resp: resp_tx,
            })
            .map_err(|e| format!("Audio thread send error: {}", e))?;

        resp_rx
            .recv()
            .map_err(|e| format!("Audio thread response error: {}", e))?
    }

    pub fn stop_recording(&self) -> Result<(Vec<u8>, u32), String> {
        let (resp_tx, resp_rx) = channel();
        self.tx
            .send(AudioCommand::Stop { resp: resp_tx })
            .map_err(|e| format!("Audio thread send error: {}", e))?;

        resp_rx
            .recv()
            .map_err(|e| format!("Audio thread response error: {}", e))?
    }

    pub fn cancel_recording(&self) {
        let _ = self.tx.send(AudioCommand::Cancel);
    }
}

// Simple linear interpolation resampler
fn resample_linear(samples: &[i16], from_rate: u32, to_rate: u32) -> Vec<i16> {
    if from_rate == to_rate {
        return samples.to_vec();
    }

    let ratio = from_rate as f64 / to_rate as f64;
    let target_len = (samples.len() as f64 / ratio).floor() as usize;
    let mut output = Vec::with_capacity(target_len);

    for i in 0..target_len {
        let src_idx = i as f64 * ratio;
        let idx0 = src_idx.floor() as usize;
        let idx1 = (idx0 + 1).min(samples.len() - 1);
        let frac = src_idx - idx0 as f64;

        let s0 = samples[idx0] as f64;
        let s1 = samples[idx1] as f64;
        let interpolated = s0 + frac * (s1 - s0);

        output.push(interpolated.clamp(-32768.0, 32767.0) as i16);
    }

    output
}
