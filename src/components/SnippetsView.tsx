import { useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  X,
  Scissors,
  Copy,
  Check,
  RotateCw,
  Upload,
} from "lucide-react";
import { SnippetEntry } from "../types";
import { addSnippet, deleteSnippet } from "../api";

interface SnippetsViewProps {
  snippets: SnippetEntry[];
  onRefresh: () => void;
}

export const SnippetsView: React.FC<SnippetsViewProps> = ({
  snippets,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isBannerVisible, setIsBannerVisible] = useState(() => {
    return localStorage.getItem("openflow:dismissed-banner:snippets") !== "true";
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [triggerInput, setTriggerInput] = useState("");
  const [expansionInput, setExpansionInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredSnippets = snippets.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.trigger.toLowerCase().includes(q) ||
        s.expansion.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerInput.trim() || !expansionInput.trim()) return;

    setIsSubmitting(true);
    try {
      await addSnippet(
        triggerInput.trim(),
        expansionInput.trim(),
        "Personal"
      );
      setTriggerInput("");
      setExpansionInput("");
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to add snippet:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSnippet(id);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete snippet:", err);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-[#111114] px-10 py-7 pb-28">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Snippets
        </h1>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              const fileInput = document.createElement("input");
              fileInput.type = "file";
              fileInput.accept = ".json";
              fileInput.onchange = async (event: any) => {
                const file = event.target?.files?.[0];
                if (file) {
                  const text = await file.text();
                  try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                      for (const item of parsed) {
                        if (item.trigger && item.expansion) {
                          await addSnippet(item.trigger, item.expansion, "Personal");
                        }
                      }
                      onRefresh();
                    }
                  } catch (e) {
                    console.error("Invalid JSON:", e);
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
          {filteredSnippets.length} {filteredSnippets.length === 1 ? "snippet" : "snippets"}
        </span>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#6c6c78] absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search snippets..."
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

      {/* Hero Banner matching Wispr Flow Screenshot 2 */}
      {isBannerVisible && (
        <div className="hero-banner shrink-0 relative overflow-hidden rounded-2xl bg-[#141217] border border-[#282025] p-6 mb-7 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-900/25 via-purple-950/30 to-neutral-900/40 pointer-events-none" />

          <button
            onClick={() => {
              setIsBannerVisible(false);
              localStorage.setItem("openflow:dismissed-banner:snippets", "true");
            }}
            className="absolute top-4 right-4 p-1 rounded-full text-[#9c948e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative z-10 max-w-2xl">
            <h2 className="text-2xl font-serif-display text-[#f6eee4] mb-2 tracking-wide">
              The stuff <span className="italic">you</span> shouldn't have to re-type.
            </h2>
            <p className="text-xs text-[#b8afa8] mb-5 leading-relaxed">
              Save text you type often — an email, intro, or prompt — then say a word to drop it in instantly.
            </p>

            {/* Example Preview Bubbles matching Wispr Flow */}
            <div className="flex flex-col gap-2.5 mb-5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-lg bg-[#201c26] border border-[#302838] text-xs font-mono text-[#dcd6e8]">
                  "my LinkedIn"
                </span>
                <span className="text-[#656573] text-xs">→</span>
                <span className="px-3 py-1 rounded-lg bg-[#181820] border border-[#292934] text-xs text-[#9a9aa8] truncate max-w-xs">
                  https://www.linkedin.com/in/your-profile
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-lg bg-[#201c26] border border-[#302838] text-xs font-mono text-[#dcd6e8]">
                  "rewrite prompt"
                </span>
                <span className="text-[#656573] text-xs">→</span>
                <span className="px-3 py-1 rounded-lg bg-[#181820] border border-[#292934] text-xs text-[#9a9aa8] truncate max-w-xs">
                  Rewrite this to be more concise and crisp...
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-medium border border-white/10 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add new snippet</span>
            </button>
          </div>
        </div>
      )}

      {/* Snippets List (Clean, minimal rows matching Wispr Flow Screenshot 2) */}
      <div className="rounded-2xl border border-[#1f1f26] bg-[#131317] divide-y divide-[#1c1c24] overflow-hidden shadow-sm">
        {filteredSnippets.length === 0 ? (
          <div className="py-20 text-center text-[#6e6e7c]">
            <Scissors className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No snippets found</p>
            <p className="text-xs text-[#525260] mt-1">
              Add voice shortcut triggers that automatically expand into full text blocks.
            </p>
          </div>
        ) : (
          filteredSnippets.map((snippet) => (
            <div
              key={snippet.id}
              className="group flex items-center justify-between px-6 py-4 hover:bg-[#16161c] transition-colors"
            >
              <div className="flex items-center gap-3 pr-4 flex-1">
                <span className="text-sm text-[#e4e4eb] font-medium font-mono select-text">
                  {snippet.trigger}
                </span>

                <span className="text-[#656573] text-xs">→</span>

                <span className="text-xs text-[#a0a0ae] leading-relaxed select-text truncate">
                  {snippet.expansion}
                </span>
              </div>

              {/* Actions on hover */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                <button
                  onClick={() => handleCopy(snippet.id, snippet.expansion)}
                  title="Copy expansion"
                  className="p-1.5 rounded-lg text-[#888898] hover:text-white hover:bg-[#202028] transition-all cursor-pointer"
                >
                  {copiedId === snippet.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  onClick={() => handleDelete(snippet.id)}
                  title="Delete snippet"
                  className="p-1.5 rounded-lg text-[#888898] hover:text-red-400 hover:bg-[#202028] transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Snippet Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#141418] border border-[#272733] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Create Voice Snippet</h3>
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
                  Spoken Trigger Phrase *
                </label>
                <input
                  type="text"
                  required
                  placeholder='e.g. "my hotmail email", "calendar link"'
                  value={triggerInput}
                  onChange={(e) => setTriggerInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1a1a20] border border-[#2b2b36] text-sm text-white placeholder-[#60606e] focus:outline-none focus:border-neutral-400 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#9a9aa8] mb-1.5">
                  Expanded Text Block *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="The full text, email address, URL, or template to insert..."
                  value={expansionInput}
                  onChange={(e) => setExpansionInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1a1a20] border border-[#2b2b36] text-sm text-white placeholder-[#60606e] focus:outline-none focus:border-neutral-400 transition-colors resize-none leading-relaxed"
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
                  {isSubmitting ? "Saving..." : "Save Snippet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
