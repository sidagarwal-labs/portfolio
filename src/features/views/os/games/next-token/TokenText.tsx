const marks: Record<string, string> = { " ": "␣", "\n": "↵", "\t": "⇥" };

/** Renders a token with visible whitespace: ␣ for a space, ↵ for a newline, ⇥ for a tab, ∅ for an empty token. */
export function TokenText({ text }: { text: string }) {
  if (text === "") return <span className="nexttoken__ws">∅</span>;
  return <>{text.split(/([ \n\t])/).map((part, index) => (marks[part] ? <span key={index} className="nexttoken__ws">{marks[part]}</span> : part))}</>;
}
