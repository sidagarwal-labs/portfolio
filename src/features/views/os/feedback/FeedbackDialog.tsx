import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ExternalLink, Globe, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { fallbackIssueUrl, MAX_COMMENT, sendFeedback, type FailureReason, type FeedbackContext, type Rating } from "./feedbackClient";
import "./feedback.css";

type Status = { kind: "form" } | { kind: "sending" } | { kind: "sent"; number?: number; url?: string } | { kind: "failed"; reason: FailureReason };

const failureText: Record<FailureReason, string> = {
  unconfigured: "Sending from this site isn't set up yet.",
  unavailable: "Feedback can't be sent from this site right now.",
  "rate-limited": "Too much feedback from this network in the last minute.",
  failed: "Your feedback couldn't be sent."
};

/* A modal <dialog>: the browser traps focus and makes the rest of Lab OS inert; onClose returns focus to the opener. */
export default function FeedbackDialog({ context, onClose }: { context: FeedbackContext; onClose: () => void }) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController>();
  const [rating, setRating] = useState<Rating>();
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "form" });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const close = () => {
    abortRef.current?.abort();
    if (dialogRef.current?.open) dialogRef.current.close();
    closeRef.current();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    firstRef.current?.focus();
    const onCancel = (event: Event) => {
      event.preventDefault();
      abortRef.current?.abort();
      dialog.close();
      closeRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (status.kind === "sent") doneRef.current?.focus();
  }, [status.kind]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!rating || status.kind === "sending") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "sending" });
    try {
      const result = await sendFeedback({ rating, comment, context, website }, { signal: controller.signal });
      setStatus(result.ok ? { kind: "sent", number: result.number, url: result.url } : { kind: "failed", reason: result.reason });
    } catch {
      return;
    }
  };

  const sending = status.kind === "sending";
  const fallback = fallbackIssueUrl({ rating, comment, context });

  return (
    <dialog ref={dialogRef} className="os-fb" aria-labelledby={`${id}-title`} aria-describedby={`${id}-notice`}>
      <div className="os-fb__bar">
        <h2 id={`${id}-title`}>Send feedback</h2>
        <button type="button" className="os-fb__x" onClick={close} aria-label="Close feedback">
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {status.kind === "sent" ? (
        <div className="os-fb__body os-fb__done" role="status">
          <p className="os-fb__thanks">
            {status.number !== undefined && status.url ? (
              <>
                Thanks! It's posted as{" "}
                <a href={status.url} target="_blank" rel="noreferrer">issue #{status.number}<ExternalLink size={13} aria-hidden="true" /></a>
              </>
            ) : "Thanks! Your feedback was sent."}
          </p>
          <div className="os-fb__buttons">
            <button ref={doneRef} type="button" className="os-button os-button--primary" onClick={close}>Done</button>
          </div>
        </div>
      ) : (
        <form className="os-fb__body" onSubmit={submit} noValidate>
          <fieldset className="os-fb__rating" disabled={sending}>
            <legend>How is the site?</legend>
            <button ref={firstRef} type="button" aria-pressed={rating === "up"} onClick={() => setRating("up")}>
              <ThumbsUp size={18} strokeWidth={2} aria-hidden="true" />
              Thumbs up
            </button>
            <button type="button" aria-pressed={rating === "down"} onClick={() => setRating("down")}>
              <ThumbsDown size={18} strokeWidth={2} aria-hidden="true" />
              Thumbs down
            </button>
          </fieldset>

          <p id={`${id}-notice`} className="os-fb__notice">
            <Globe size={16} strokeWidth={2} aria-hidden="true" />
            <span><strong>This is public.</strong> Feedback is posted as an issue on GitHub that anyone can read, so don't include personal or sensitive information.</span>
          </p>

          <label className="os-fb__label" htmlFor={`${id}-comment`}>Comment <span>(optional)</span></label>
          <textarea
            id={`${id}-comment`}
            className="os-fb__comment"
            value={comment}
            maxLength={MAX_COMMENT}
            rows={5}
            disabled={sending}
            aria-describedby={`${id}-notice ${id}-count`}
            onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT))}
            placeholder="What worked, what didn't, or what you'd like to see"
          />
          <p id={`${id}-count`} className="os-fb__count">{comment.length} / {MAX_COMMENT} characters</p>

          {/* Honeypot: hidden from people and assistive tech; bots that fill every field get rejected by the Worker. */}
          <div className="os-fb__hp" aria-hidden="true">
            <label htmlFor={`${id}-website`}>Website</label>
            <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </div>

          {status.kind === "failed" && (
            <div className="os-fb__error" role="alert">
              <p>{failureText[status.reason]} You can open the same feedback as a prefilled GitHub issue instead (it's public too).</p>
              <a className="os-button" href={fallback} target="_blank" rel="noreferrer">
                Open a prefilled issue on GitHub
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          )}

          <div className="os-fb__buttons">
            {!rating && <span className="os-fb__hint">Pick thumbs up or down to send.</span>}
            <button type="button" className="os-button" onClick={close}>Cancel</button>
            <button type="submit" className="os-button os-button--primary" disabled={!rating || sending}>
              {sending ? "Sending…" : status.kind === "failed" ? "Try again" : "Send"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
