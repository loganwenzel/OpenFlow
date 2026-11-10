use crate::db::{DictionaryEntry, SnippetEntry};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::Client;
use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct TranscribeResult {
    pub text: String,
    pub prompt_tokens: usize,
    pub output_tokens: usize,
    pub cost_usd: f64,
}

pub struct GeminiTranscriber {
    client: Client,
}

impl Default for GeminiTranscriber {
    fn default() -> Self {
        Self::new()
    }
}

impl GeminiTranscriber {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn build_system_prompt(
        &self,
        active_app: &str,
        dictionary: &[DictionaryEntry],
        snippets: &[SnippetEntry],
    ) -> String {
        let mut dict_lines = Vec::new();
        for entry in dictionary {
            if let Some(ref repl) = entry.replacement {
                dict_lines.push(format!("- \"{}\" -> always format/replace as \"{}\"", entry.term, repl));
            } else {
                dict_lines.push(format!("- {}", entry.term));
            }
        }
        let dict_section = if dict_lines.is_empty() {
            "None provided.".to_string()
        } else {
            dict_lines.join("\n")
        };

        let mut snippet_lines = Vec::new();
        for s in snippets {
            snippet_lines.push(format!("- Trigger: \"{}\" => Expansion: \"{}\"", s.trigger, s.expansion));
        }
        let snippet_section = if snippet_lines.is_empty() {
            "None configured.".to_string()
        } else {
            snippet_lines.join("\n")
        };

        format!(
r#"You are an ultra-fast, high-accuracy dictation engine modeled after Wispr Flow.
Your ONLY job is to transcribe the user's spoken audio into clean, natural written text.

STRICT RULES:
1. Output ONLY the final formatted text. Never add conversational filler, quotes, preambles, or explanations.
2. Remove speech disfluencies, stutters, and filler words ("um", "uh", "like", "you know") and false starts/self-corrections (e.g., "let's meet at 2 no actually 3 pm" -> "Let's meet at 3 PM").
3. Apply proper punctuation, capitalization, and paragraph breaks automatically based on tone and context.
4. Active Application Context: The user is currently typing inside "{active_app}". Adjust formatting subtly if appropriate (e.g., casual for Slack/Messages, clean prose for Mail/Docs, technical accuracy for Code Editors).
5. Custom Dictionary (Always prioritize these exact spellings and capitalizations when phonetically similar words are spoken):
{dict_section}
6. Voice Snippets (Whenever the user speaks one of the following trigger phrases, replace the trigger phrase seamlessly with its exact expansion value):
{snippet_section}
7. If the audio is completely silent or contains only background noise, return an empty string."#
        )
    }

    pub async fn transcribe(
        &self,
        api_key: &str,
        model: &str,
        wav_bytes: &[u8],
        active_app: &str,
        dictionary: &[DictionaryEntry],
        snippets: &[SnippetEntry],
    ) -> Result<TranscribeResult, String> {
        let clean_key = api_key.trim();
        if clean_key.is_empty() {
            return Err("Gemini API key is missing. Please set it in Settings.".to_string());
        }

        let model_id = if model.is_empty() {
            "gemini-3.5-flash-lite"
        } else {
            model
        };

        let system_prompt = self.build_system_prompt(active_app, dictionary, snippets);
        let audio_base64 = BASE64.encode(wav_bytes);

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model_id, clean_key
        );

        let payload = json!({
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "audio/wav",
                                "data": audio_base64
                            }
                        }
                    ]
                }
            ],
            "system_instruction": {
                "parts": [
                    {
                        "text": system_prompt
                    }
                ]
            },
            "generationConfig": {
                "temperature": 0.0,
                "maxOutputTokens": 2048
            }
        });

        let response = self
            .client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Network error connecting to Gemini API: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Gemini API error ({}): {}", status, error_text));
        }

        let resp_json: Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

        // Extract candidates[0].content.parts[0].text
        let raw_text = resp_json
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        // Extract usageMetadata token counts from Gemini response
        let prompt_tokens = resp_json
            .pointer("/usageMetadata/promptTokenCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;
        let output_tokens = resp_json
            .pointer("/usageMetadata/candidatesTokenCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;

        // Break down audio vs text input tokens if promptTokensDetails is provided
        let mut audio_tokens = 0usize;
        if let Some(details) = resp_json
            .pointer("/usageMetadata/promptTokensDetails")
            .and_then(|v| v.as_array())
        {
            for item in details {
                if item.get("modality").and_then(|m| m.as_str()) == Some("AUDIO") {
                    audio_tokens += item
                        .get("tokenCount")
                        .and_then(|t| t.as_u64())
                        .unwrap_or(0) as usize;
                }
            }
        }
        let text_input_tokens = prompt_tokens.saturating_sub(audio_tokens);
        let cost_usd = estimate_gemini_cost_usd(
            model_id,
            text_input_tokens,
            audio_tokens,
            output_tokens,
        );

        // Deterministic post-processing fallback for snippets and dictionary
        let processed_text = post_process_text(&raw_text, snippets, dictionary);

        Ok(TranscribeResult {
            text: processed_text,
            prompt_tokens,
            output_tokens,
            cost_usd,
        })
    }
}

/// Estimates USD cost for a single Gemini API call based on official per-1M-token rates.
pub fn estimate_gemini_cost_usd(
    model_id: &str,
    text_input_tokens: usize,
    audio_input_tokens: usize,
    output_tokens: usize,
) -> f64 {
    let m = model_id.to_lowercase();
    let (text_in_per_m, audio_in_per_m, out_per_m) = if m.contains("lite") {
        // Gemini Flash-Lite tier ($0.10 text in, $0.30 audio in, $0.40 out per 1M tokens)
        (0.10, 0.30, 0.40)
    } else if m.contains("pro") {
        // Gemini Pro tier ($1.25 in, $10.00 out per 1M tokens)
        (1.25, 1.25, 10.00)
    } else {
        // Standard Gemini Flash tier ($0.30 text in, $1.00 audio in, $2.50 out per 1M tokens)
        (0.30, 1.00, 2.50)
    };

    (text_input_tokens as f64 * text_in_per_m
        + audio_input_tokens as f64 * audio_in_per_m
        + output_tokens as f64 * out_per_m)
        / 1_000_000.0
}

/// Fallback post-processing: ensures snippets and dictionary corrections are deterministically applied
pub fn post_process_text(
    text: &str,
    snippets: &[SnippetEntry],
    dictionary: &[DictionaryEntry],
) -> String {
    let mut result = text.to_string();

    // 1. Snippets expansion
    for s in snippets {
        let trigger = s.trigger.trim();
        if trigger.is_empty() {
            continue;
        }

        // Case-insensitive replacement
        let lower_result = result.to_lowercase();
        let lower_trigger = trigger.to_lowercase();

        if let Some(idx) = lower_result.find(&lower_trigger) {
            let before = &result[..idx];
            let after = &result[idx + lower_trigger.len()..];
            result = format!("{}{}{}", before, s.expansion, after);
        }
    }

    // 2. Dictionary corrections (e.g. term -> replacement)
    for entry in dictionary {
        if let Some(ref repl) = entry.replacement {
            let term = entry.term.trim();
            if term.is_empty() {
                continue;
            }

            let lower_result = result.to_lowercase();
            let lower_term = term.to_lowercase();

            if let Some(idx) = lower_result.find(&lower_term) {
                let before = &result[..idx];
                let after = &result[idx + lower_term.len()..];
                result = format!("{}{}{}", before, repl, after);
            }
        }
    }

    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snippet_expansion_fallback() {
        let snippets = vec![
            SnippetEntry {
                id: "1".into(),
                trigger: "my work email".into(),
                expansion: "alex@example.com".into(),
                category: "Personal".into(),
                created_at: "".into(),
            },
            SnippetEntry {
                id: "2".into(),
                trigger: "calendar link".into(),
                expansion: "https://cal.com/alex/30min".into(),
                category: "Personal".into(),
                created_at: "".into(),
            },
        ];

        let dictionary = vec![DictionaryEntry {
            id: "1".into(),
            term: "btw".into(),
            replacement: Some("by the way".into()),
            category: "Personal".into(),
            created_at: "".into(),
        }];

        let input = "Please send the calendar invite to my work email btw!";
        let processed = post_process_text(input, &snippets, &dictionary);

        assert_eq!(
            processed,
            "Please send the calendar invite to alex@example.com by the way!"
        );
    }

    #[test]
    fn test_prompt_generation() {
        let transcriber = GeminiTranscriber::new();
        let snippets = vec![SnippetEntry {
            id: "1".into(),
            trigger: "my email".into(),
            expansion: "test@example.com".into(),
            category: "Personal".into(),
            created_at: "".into(),
        }];
        let dictionary = vec![
            DictionaryEntry {
                id: "1".into(),
                term: "Supabase".into(),
                replacement: None,
                category: "Personal".into(),
                created_at: "".into(),
            },
            DictionaryEntry {
                id: "2".into(),
                term: "btw".into(),
                replacement: Some("by the way".into()),
                category: "Personal".into(),
                created_at: "".into(),
            },
        ];

        let prompt = transcriber.build_system_prompt("Slack", &dictionary, &snippets);
        assert!(prompt.contains(r#"Active Application Context: The user is currently typing inside "Slack""#));
        assert!(prompt.contains("- Supabase"));
        assert!(prompt.contains(r#"- "btw" -> always format/replace as "by the way""#));
        assert!(prompt.contains(r#"- Trigger: "my email" => Expansion: "test@example.com""#));
    }
}

