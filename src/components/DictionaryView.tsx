import { useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  X,
  BookA,
  RotateCw,
  Upload,
} from "lucide-react";
import { DictionaryEntry } from "../types";
import { addDictionaryWord, deleteDictionaryWord } from "../api";

interface DictionaryViewProps {
  entries: DictionaryEntry[];
  onRefresh: () => void;
}

export const DictionaryView: React.FC<DictionaryViewProps> = ({
  entries,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [termInput, setTermInput] = useState("");
  const [replacementInput, setReplacementInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredEntries = entries.filter((e) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.term.toLowerCase().includes(q) ||
        (e.replacement && e.replacement.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termInput.trim()) return;

    setIsSubmitting(true);
    try {
      await addDictionaryWord(
        termInput.trim(),
        replacementInput.trim() ? replacementInput.trim() : null,
        "Personal"
      );
      setTermInput("");
      setReplacementInput("");
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to add dictionary entry:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDictionaryWord(id);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete entry:", err);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-[#111114] px-10 py-7 pb-28">
      {/* Top Header matching Wispr Flow Screenshot 1 */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Dictionary
        </h1>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              const fileInput = document.createElement("input");
              fileInput.type = "file";
              fileInput.accept = ".json,.txt";
              fileInput.onchange = async (event: any) => {
                const file = event.target?.files?.[0];
                if (file) {
                  const text = await file.text();
                  try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                      for (const item of parsed) {
                        const term = item.term || item;
                        if (typeof term === "string") {
                          await addDictionaryWord(term, item.replacement || null, "Personal");
                        }
                      }
                      onRefresh();
                    }
                  } catch {
                    const lines = text.split("\n");
                    for (const line of lines) {
                      if (line.trim()) {
                        await addDictionaryWord(line.trim(), null, "Personal");
                      }
                    }
                    onRefresh();
                  }
                }
              };
              fileInput.click();
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#18181e] hover:bg-[#202028] text-neutral-300 font-medium text-xs border border-[#262630] transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-all shadow cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-black" />
            <span>Add new</span>
          </button>
        </div>
      </div>

      {/* Search & Controls */}
      <div className="flex items-center justify-between border-b border-[#1c1c22] pb-3 mb-6 shrink-0">
        <span className="text-xs font-medium text-[#7a7a88]">
          {filteredEntries.length} {filteredEntries.length === 1 ? "word" : "words"}
        </span>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#6c6c78] absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search words..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#16161b] border border-[#24242e] rounded-full pl-8 pr-3 py-1 text-xs text-[#ededf0] placeholder-[#60606a] focus:outline-none focus:border-[#404050] transition-colors w-44"
            />
          </div>

          <button
            onClick={onRefresh}
            title="Refresh list"
            className="p-1.5 rounded-lg text-[#7c7c8a] hover:text-white hover:bg-[#181820] transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Hero Banner matching Wispr Flow Screenshot 1 (shrink-0 prevents clipping) */}
      {isBannerVisible && (
        <div className="hero-banner shrink-0 relative overflow-hidden rounded-2xl bg-[#141217] border border-[#282025] p-6 mb-7 shadow-lg">
          {/* Ambient blurred photo effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-900/25 via-purple-950/30 to-neutral-900/40 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-orange-500/10 to-transparent pointer-events-none" />

          <button
            onClick={() => setIsBannerVisible(false)}
            className="absolute top-4 right-4 p-1 rounded-full text-[#9c948e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative z-10 max-w-2xl">
            <h2 className="text-2xl font-serif-display text-[#f6eee4] mb-2 tracking-wide">
              Flow spells the way you do.
            </h2>
            <p className="text-xs text-[#b8afa8] mb-5 leading-relaxed">
              Add your personal terms, technical jargon, or uncommon names so they are always spelled right in your dictations.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-medium border border-white/10 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add new word</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dictionary Entries List (Clean, minimal rows matching Wispr Flow Screenshot 1) */}
      <div className="rounded-2xl border border-[#1f1f26] bg-[#131317] divide-y divide-[#1c1c24] overflow-hidden shadow-sm">
        {filteredEntries.length === 0 ? (
          <div className="py-20 text-center text-[#6e6e7c]">
            <BookA className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No words found</p>
            <p className="text-xs text-[#525260] mt-1">
              Add terms to make Gemini prioritize your exact spellings.
            </p>
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-center justify-between px-6 py-4 hover:bg-[#16161c] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm text-[#e4e4eb] font-medium select-text">
                  {entry.term}
                </span>

                {entry.replacement && (
                  <>
                    <span className="text-[#656573] text-xs">→</span>
                    <span className="text-sm text-emerald-400 font-medium select-text">
                      {entry.replacement}
                    </span>
                  </>
                )}
              </div>

              {/* Delete action on hover */}
              <button
                onClick={() => handleDelete(entry.id)}
                title="Delete word"
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#888898] hover:text-red-400 hover:bg-[#202028] transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Word Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141418] border border-[#272733] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Add New Word</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-[#9a9aa8] mb-1.5">
                  Word, Name, or Spoken Term *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Supabase, GraphQL, btw"
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1a1a20] border border-[#2b2b36] text-sm text-white placeholder-[#60606e] focus:outline-none focus:border-neutral-400 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#9a9aa8] mb-1.5">
                  Misspelling Correction / Formatted Replacement (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. by the way"
                  value={replacementInput}
                  onChange={(e) => setReplacementInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1a1a20] border border-[#2b2b36] text-sm text-white placeholder-[#60606e] focus:outline-none focus:border-neutral-400 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1d1d24] text-neutral-300 text-xs font-medium hover:bg-[#252530] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors cursor-pointer"
                >
                  {isSubmitting ? "Saving..." : "Save Word"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
