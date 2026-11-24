/**
 * Prep kit: "Scan, dig, jot".
 *
 * - Scan: cue cards with 2-4 short lines each, and a sticky chip bar to jump.
 * - Dig: tap "More" on a card for the full script and detail.
 * - Jot: one box pinned to the bottom. Type and press Enter; no tagging
 *   needed. The card you last opened rides along as a hint. After the call,
 *   "Wrap up" organises the jots into a note and updates the kit, after you
 *   review it.
 */
import type {
  Job,
  JobJot,
  PrepKitContent,
  PrepKitQuestion,
  PrepKitResponse,
  PrepKitSection,
  PrepKitWrapUpProposal,
} from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";
import * as api from "@/client/api";
import { JobDescriptionMarkdown } from "@/client/components/JobDescriptionMarkdown";
import { showErrorToast } from "@/client/lib/error-toast";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const QUESTIONS_ANCHOR = "prep-questions";
const JOTS_ANCHOR = "prep-jots";
const QUESTIONS_KEY = "My questions";
const JOTS_KEY = "Jots";
/** Long enough for a full set of pasted call notes; matches the server. */
const MAX_JOT_CHARS = 20000;

function chipClass(selected: boolean): string {
  return cn(
    "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
    selected
      ? "border-primary/60 bg-primary/15 text-foreground"
      : "border-border/60 bg-card",
  );
}

function cardBorder(selected: boolean): string {
  return selected ? "border-primary/60" : "border-border/50";
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatJotTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function anchorFor(section: PrepKitSection): string {
  return `prep-card-${section.id}`;
}

function scrollToAnchor(anchor: string) {
  document
    .getElementById(anchor)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- cards ----------

type SectionCardProps = {
  section: PrepKitSection;
  isActive: boolean;
  onActivate: () => void;
  onSave: (section: PrepKitSection) => void;
  onDelete: () => void;
};

export const PrepKitSectionCard: React.FC<SectionCardProps> = ({
  section,
  isActive,
  onActivate,
  onSave,
  onDelete,
}) => {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(section.title);
  const [cues, setCues] = React.useState(section.cues.join("\n"));
  const [detail, setDetail] = React.useState(section.detail);

  const startEdit = () => {
    setTitle(section.title);
    setCues(section.cues.join("\n"));
    setDetail(section.detail);
    setEditing(true);
  };

  const save = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error("Give the card a title.");
      return;
    }
    onSave({
      ...section,
      title: cleanTitle,
      cues: cues
        .split("\n")
        .map((cue) => cue.trim())
        .filter(Boolean),
      detail: detail.trim(),
    });
    setEditing(false);
  };

  return (
    <section
      id={anchorFor(section)}
      className={cn(
        "scroll-mt-28 rounded-xl border bg-card/85 p-4 transition-colors",
        cardBorder(isActive),
      )}
    >
      {editing ? (
        <div className="space-y-3">
          <Input
            id={`prep-title-${section.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Card title"
          />
          <div className="space-y-1">
            <label
              htmlFor={`prep-cues-${section.id}`}
              className="text-xs text-muted-foreground"
            >
              Cues, one per line
            </label>
            <Textarea
              id={`prep-cues-${section.id}`}
              value={cues}
              onChange={(event) => setCues(event.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor={`prep-detail-${section.id}`}
              className="text-xs text-muted-foreground"
            >
              Detail (Markdown)
            </label>
            <Textarea
              id={`prep-detail-${section.id}`}
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              rows={8}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete card
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={save}>
                Save card
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 text-left text-xs font-bold uppercase tracking-wider text-primary"
              onClick={onActivate}
            >
              {section.title}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-2 h-8 w-8 shrink-0 text-muted-foreground"
              onClick={startEdit}
              aria-label={`Edit ${section.title}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
          {section.cues.length > 0 && (
            <ul className="space-y-1.5">
              {section.cues.map((cue, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: cues are plain strings that may repeat
                  key={index}
                  className="relative pl-4 text-[15px] font-semibold leading-snug"
                >
                  <span className="absolute left-0 top-[0.55em] h-1.5 w-1.5 rounded-full bg-primary" />
                  {cue}
                </li>
              ))}
            </ul>
          )}
          {section.detail && (
            <div className="border-t border-border/50 pt-2">
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-semibold text-primary"
                aria-expanded={open}
                onClick={() => {
                  setOpen((value) => !value);
                  onActivate();
                }}
              >
                {open ? "Less" : "More"}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
              {open && (
                <JobDescriptionMarkdown
                  description={section.detail}
                  className="mt-2 text-sm"
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

type QuestionsCardProps = {
  questions: PrepKitQuestion[];
  isActive: boolean;
  onChange: (questions: PrepKitQuestion[]) => void;
  onActivate: () => void;
};

export const PrepKitQuestionsCard: React.FC<QuestionsCardProps> = ({
  questions,
  isActive,
  onChange,
  onActivate,
}) => {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const open = questions.filter((q) => !q.answered).length;

  const toggle = (id: string) =>
    onChange(
      questions.map((q) => (q.id === id ? { ...q, answered: !q.answered } : q)),
    );

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([
      ...questions,
      { id: newId(), text, detail: "", answered: false, answer: "" },
    ]);
    setDraft("");
  };

  return (
    <section
      id={QUESTIONS_ANCHOR}
      className={cn(
        "scroll-mt-28 space-y-3 rounded-xl border bg-card/85 p-4 transition-colors",
        cardBorder(isActive),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-xs font-bold uppercase tracking-wider text-primary"
          onClick={onActivate}
        >
          My questions
        </button>
        <span className="text-xs text-muted-foreground">
          {open} of {questions.length} to ask · tap to tick off
        </span>
      </div>
      <ol className="space-y-2">
        {questions.map((question, index) => (
          <li key={question.id} className="space-y-1">
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => toggle(question.id)}
                aria-pressed={question.answered}
                className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
                    question.answered
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {question.answered ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 text-[15px] font-semibold leading-snug",
                    question.answered && "text-muted-foreground line-through",
                  )}
                >
                  {question.text}
                </span>
              </button>
              {(question.detail || question.answer) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Show detail"
                  aria-expanded={openId === question.id}
                  onClick={() =>
                    setOpenId((id) => (id === question.id ? null : question.id))
                  }
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      openId === question.id && "rotate-180",
                    )}
                  />
                </Button>
              )}
            </div>
            {question.answer && (
              <p className="ml-8 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Answer:</span>{" "}
                {question.answer}
              </p>
            )}
            {openId === question.id && question.detail && (
              <JobDescriptionMarkdown
                description={question.detail}
                className="ml-8 text-sm"
              />
            )}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Input
          id="prep-new-question"
          value={draft}
          placeholder="Add a question"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          aria-label="Add question"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
};

// ---------- jots ----------

const JotsCard: React.FC<{
  jots: JobJot[];
  isActive: boolean;
  onDelete: (jot: JobJot) => void;
  onWrapUp: () => void;
  isWrappingUp: boolean;
}> = ({ jots, isActive, onDelete, onWrapUp, isWrappingUp }) => (
  <section
    id={JOTS_ANCHOR}
    className={cn(
      "scroll-mt-28 space-y-3 rounded-xl border bg-card/85 p-4 transition-colors",
      cardBorder(isActive),
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-bold uppercase tracking-wider text-primary">
        Jots from this call
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onWrapUp}
        disabled={jots.length === 0 || isWrappingUp}
      >
        {isWrappingUp ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        )}
        {isWrappingUp ? "Organising..." : "Wrap up"}
      </Button>
    </div>
    {jots.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        Nothing yet. Type in the box at the bottom during the call: shorthand is
        fine and you don't need to label anything. Wrap up sorts it afterwards.
      </p>
    ) : (
      <ul className="space-y-1.5">
        {jots.map((jot) => (
          <li key={jot.id} className="group flex items-start gap-2 text-sm">
            <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
              {formatJotTime(jot.createdAt)}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {jot.text}
              {jot.sectionHint && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  {jot.sectionHint}
                </Badge>
              )}
            </span>
            <button
              type="button"
              onClick={() => onDelete(jot)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
              aria-label="Delete jot"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const JotBar: React.FC<{
  hint: string | null;
  onClearHint: () => void;
  onSubmit: (text: string) => Promise<void>;
}> = ({ hint, onClearHint, onSubmit }) => {
  const [text, setText] = React.useState("");
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Grow with the text (up to about a third of the screen, then scroll).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // Every Enter saves, even while an earlier jot is still on its way: fast
  // typing mid-call must never drop a note.
  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    inputRef.current?.focus();
    try {
      await onSubmit(value);
    } catch (error) {
      // Put it back only if the box is still empty, so nothing new is lost.
      setText((current) => (current.trim() ? current : value));
      showErrorToast(error, `Couldn't save "${value.slice(0, 40)}"`);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur xl:sticky xl:rounded-xl xl:border"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <form
        className="mx-auto flex max-w-3xl flex-col gap-1.5 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {hint && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Jotting under
            <button
              type="button"
              onClick={onClearHint}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 font-medium text-foreground"
              aria-label={`Stop jotting under ${hint}`}
            >
              {hint}
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            id="prep-jot-input"
            value={text}
            rows={1}
            maxLength={MAX_JOT_CHARS}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter saves; Shift+Enter adds a line. Pasted line breaks stay.
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Jot a note... Enter saves it"
            autoComplete="off"
            enterKeyHint="send"
            className="max-h-[35vh] min-h-11 resize-none overflow-y-auto py-2.5 text-base"
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={!text.trim()}
            aria-label="Save jot"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};

// ---------- wrap-up review ----------

const WrapUpDialog: React.FC<{
  proposal: PrepKitWrapUpProposal | null;
  questions: PrepKitQuestion[];
  isSaving: boolean;
  onCancel: () => void;
  onApply: (input: { noteTitle: string; noteContent: string }) => void;
}> = ({ proposal, questions, isSaving, onCancel, onApply }) => {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");

  React.useEffect(() => {
    if (proposal) {
      setTitle(proposal.noteTitle);
      setContent(proposal.noteContent);
    }
  }, [proposal]);

  const answered = proposal
    ? proposal.answeredQuestionIds
        .map((id) => proposal.kit.questions.find((q) => q.id === id))
        .filter((q): q is PrepKitQuestion => !!q)
    : [];
  const newQuestions = proposal
    ? proposal.kit.questions.filter(
        (q) => !questions.some((existing) => existing.id === q.id),
      )
    : [];

  return (
    <Dialog open={!!proposal} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review your call notes</DialogTitle>
          <DialogDescription>
            Check the AI read your shorthand right. Saving adds this note to
            Notes and updates the prep kit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            id="prep-wrap-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Note title"
          />
          <Textarea
            id="prep-wrap-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={14}
            className="font-mono text-xs"
            aria-label="Note content"
          />
          {proposal && (
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
              <div className="font-semibold">Changes to the prep kit</div>
              {proposal.changedSections.length > 0 ? (
                <p>
                  <span className="text-muted-foreground">Cards updated: </span>
                  {proposal.changedSections.join(", ")}
                </p>
              ) : (
                <p className="text-muted-foreground">No cards changed.</p>
              )}
              {answered.length > 0 && (
                <div>
                  <div className="text-muted-foreground">
                    Questions answered:
                  </div>
                  <ul className="ml-4 list-disc">
                    {answered.map((q) => (
                      <li key={q.id}>
                        {q.text}
                        {q.answer ? ` — ${q.answer}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {newQuestions.length > 0 && (
                <div>
                  <div className="text-muted-foreground">
                    New questions for later rounds:
                  </div>
                  <ul className="ml-4 list-disc">
                    {newQuestions.map((q) => (
                      <li key={q.id}>{q.text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Not now
          </Button>
          <Button
            type="button"
            disabled={isSaving || !title.trim() || !content.trim()}
            onClick={() =>
              onApply({ noteTitle: title.trim(), noteContent: content.trim() })
            }
          >
            {isSaving && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            Save to Notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- panel ----------

export const PrepKitPanel: React.FC<{ job: Job }> = ({ job }) => {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.jobs.prepKit(job.id);
  // activeTitle: the card new jots are filed under (a hint for wrap-up).
  // selected: what's highlighted in the chip bar and card borders.
  const [activeTitle, setActiveTitle] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const navRef = React.useRef<HTMLElement>(null);

  const select = (key: string, anchor: string, hint: boolean) => {
    setSelected(key);
    if (hint) setActiveTitle(key);
    scrollToAnchor(anchor);
    // Keep the chosen chip visible in the chip bar too.
    navRef.current
      ?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const activate = (key: string) => {
    setSelected(key);
    setActiveTitle(key);
  };
  const [proposal, setProposal] = React.useState<PrepKitWrapUpProposal | null>(
    null,
  );

  const prepQuery = useQuery({
    queryKey,
    queryFn: () => api.getPrepKit(job.id),
  });
  const data = prepQuery.data;
  const kit = data?.kit ?? null;
  const jots = data?.jots ?? [];

  const setData = (next: PrepKitResponse) =>
    queryClient.setQueryData(queryKey, next);

  const generate = useMutation({
    mutationFn: () => api.generatePrepKit(job.id),
    onSuccess: (next) => {
      setData(next);
      toast.success(kit ? "Prep kit refreshed" : "Prep kit ready");
    },
    onError: (error) => showErrorToast(error, "Couldn't build the prep kit"),
  });

  const saveKit = useMutation({
    mutationFn: (content: PrepKitContent) => api.savePrepKit(job.id, content),
    onMutate: (content) => {
      const previous = queryClient.getQueryData<PrepKitResponse>(queryKey);
      if (previous?.kit) {
        setData({ ...previous, kit: { ...previous.kit, ...content } });
      }
      return { previous };
    },
    onError: (error, _content, context) => {
      if (context?.previous) setData(context.previous);
      showErrorToast(error, "Couldn't save the prep kit");
    },
    onSuccess: (next) => setData(next),
  });

  const wrapUp = useMutation({
    mutationFn: () => api.proposePrepKitWrapUp(job.id),
    onSuccess: (next) => setProposal(next),
    onError: (error) => showErrorToast(error, "Couldn't organise your jots"),
  });

  const applyWrapUp = useMutation({
    mutationFn: (input: { noteTitle: string; noteContent: string }) => {
      if (!proposal) throw new Error("Nothing to save");
      return api.applyPrepKitWrapUp(job.id, {
        ...input,
        kit: proposal.kit,
        jotIds: proposal.jotIds,
      });
    },
    onSuccess: (next) => {
      setData({ kit: next.kit, jots: next.jots });
      setProposal(null);
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.jobs.all, "notes", job.id],
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      toast.success("Saved to Notes and updated the prep kit");
    },
    onError: (error) => showErrorToast(error, "Couldn't save the wrap-up"),
  });

  const addJot = async (text: string) => {
    const jot = await api.addJot(job.id, { text, sectionHint: activeTitle });
    const current = queryClient.getQueryData<PrepKitResponse>(queryKey);
    setData({
      kit: current?.kit ?? null,
      jots: [...(current?.jots ?? []), jot],
    });
  };

  const removeJot = async (jot: JobJot) => {
    const current = queryClient.getQueryData<PrepKitResponse>(queryKey);
    if (current) {
      setData({
        ...current,
        jots: current.jots.filter((j) => j.id !== jot.id),
      });
    }
    try {
      await api.deleteJot(job.id, jot.id);
    } catch (error) {
      if (current) setData(current);
      showErrorToast(error, "Couldn't delete that jot");
    }
  };

  const updateSections = (sections: PrepKitSection[]) => {
    if (!kit) return;
    saveKit.mutate({ sections, questions: kit.questions });
  };

  const updateQuestions = (questions: PrepKitQuestion[]) => {
    if (!kit) return;
    saveKit.mutate({ sections: kit.sections, questions });
  };

  const addCard = () => {
    if (!kit) return;
    updateSections([
      ...kit.sections,
      { id: newId(), title: "New card", cues: [], detail: "" },
    ]);
  };

  if (prepQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/85 p-6 text-sm text-muted-foreground">
        Loading prep kit...
      </div>
    );
  }

  if (prepQuery.isError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-card/85 p-6 text-sm">
        Couldn't load the prep kit.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void prepQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  const questionsLeft = kit?.questions.filter((q) => !q.answered).length ?? 0;

  return (
    <div className="space-y-4 pb-32 xl:pb-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-base font-semibold">
            <NotebookPen className="h-4 w-4" />
            Prep kit
          </div>
          <p className="text-sm text-muted-foreground">
            Scan the cards, tap More to dig in, jot as you go.
          </p>
        </div>
        {kit && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addCard}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Card
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              title="Rebuild the cards with your latest notes and emails. Your edits are kept where they still fit."
            >
              {generate.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {generate.isPending ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        )}
      </header>

      {!kit && (
        <section className="space-y-3 rounded-xl border border-border/50 bg-card/85 p-5">
          <div className="text-lg font-semibold">
            Get ready for your next conversation with {job.employer}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            The AI builds cue cards from the posting, your profile, pitch and
            proof points, your cover letter, notes and emails: an opener, why
            this role, proof points, gaps, a salary script, role facts and
            questions to ask. Everything stays editable, and the kit grows as
            you go through each round.
          </p>
          <Button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {generate.isPending ? "Building your kit..." : "Build prep kit"}
          </Button>
          <p className="text-xs text-muted-foreground">
            You can jot notes below even without a kit.
          </p>
        </section>
      )}

      {kit && (
        <nav
          ref={navRef}
          aria-label="Prep kit cards"
          className="sticky top-0 z-30 -mx-1 flex gap-1.5 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur [scrollbar-width:none]"
          style={{ top: "env(safe-area-inset-top, 0px)" }}
        >
          {kit.sections.map((section) => (
            <button
              key={section.id}
              type="button"
              data-chip={section.title}
              aria-current={selected === section.title ? "true" : undefined}
              onClick={() => select(section.title, anchorFor(section), true)}
              className={chipClass(selected === section.title)}
            >
              {section.title}
            </button>
          ))}
          {kit.questions.length > 0 && (
            <button
              type="button"
              data-chip={QUESTIONS_KEY}
              aria-current={selected === QUESTIONS_KEY ? "true" : undefined}
              onClick={() => select(QUESTIONS_KEY, QUESTIONS_ANCHOR, true)}
              className={chipClass(selected === QUESTIONS_KEY)}
            >
              My Qs · {questionsLeft}
            </button>
          )}
          <button
            type="button"
            data-chip={JOTS_KEY}
            aria-current={selected === JOTS_KEY ? "true" : undefined}
            // Jumping to the jot list doesn't change which card jots go under.
            onClick={() => select(JOTS_KEY, JOTS_ANCHOR, false)}
            className={chipClass(selected === JOTS_KEY)}
          >
            Jots · {jots.length}
          </button>
        </nav>
      )}

      {kit?.sections.map((section) => (
        <PrepKitSectionCard
          key={section.id}
          section={section}
          isActive={selected === section.title}
          onActivate={() => activate(section.title)}
          onSave={(next) =>
            updateSections(
              kit.sections.map((s) => (s.id === next.id ? next : s)),
            )
          }
          onDelete={() =>
            updateSections(kit.sections.filter((s) => s.id !== section.id))
          }
        />
      ))}

      {kit && (
        <PrepKitQuestionsCard
          questions={kit.questions}
          isActive={selected === QUESTIONS_KEY}
          onChange={updateQuestions}
          onActivate={() => activate(QUESTIONS_KEY)}
        />
      )}

      <JotsCard
        jots={jots}
        isActive={selected === JOTS_KEY}
        onDelete={(jot) => void removeJot(jot)}
        onWrapUp={() => wrapUp.mutate()}
        isWrappingUp={wrapUp.isPending}
      />

      <JotBar
        hint={activeTitle}
        onClearHint={() => setActiveTitle(null)}
        onSubmit={addJot}
      />

      <WrapUpDialog
        proposal={proposal}
        questions={kit?.questions ?? []}
        isSaving={applyWrapUp.isPending}
        onCancel={() => setProposal(null)}
        onApply={(input) => applyWrapUp.mutate(input)}
      />
    </div>
  );
};
