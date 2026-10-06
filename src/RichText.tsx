import { Fragment, useId, useState } from "react";
import { safeHttps } from "./data";
function inline(text: string, depth = 0): React.ReactNode[] {
  if (depth > 3) return [text];
  const regex =
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https:\/\/[^\s)]+\)|https:\/\/[^\s<>]+)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(regex)) {
    const value = match[0];
    const key = match.index!;
    nodes.push(text.slice(last, key));
    if (value.startsWith("`"))
      nodes.push(<code key={key}>{value.slice(1, -1)}</code>);
    else if (value.startsWith("**"))
      nodes.push(
        <strong key={key}>{inline(value.slice(2, -2), depth + 1)}</strong>,
      );
    else {
      const markdown = /^\[([^\]]+)\]\((.+)\)$/.exec(value);
      const url = markdown ? markdown[2] : value.replace(/[.,;:!?\)\]]+$/, "");
      const href = safeHttps(url);
      nodes.push(
        href ? (
          <Fragment key={key}>
            <a href={href} target="_blank" rel="noopener noreferrer">
              {markdown ? markdown[1] : url}
            </a>
            {markdown ? "" : value.slice(url.length)}
          </Fragment>
        ) : (
          value
        ),
      );
    }
    last = key + value.length;
  }
  nodes.push(text.slice(last));
  return nodes;
}
export function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[-*]\s+/.test(lines[i])) {
      const list: React.ReactNode[] = [];
      const start = i;
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        list.push(
          <li key={i}>{inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>,
        );
        i++;
      }
      i--;
      nodes.push(<ul key={start}>{list}</ul>);
    } else
      nodes.push(
        <Fragment key={i}>
          {inline(lines[i])}
          {i < lines.length - 1 && "\n"}
        </Fragment>,
      );
  }
  return (
    <div className="rich-text" dir="auto">
      {nodes}
    </div>
  );
}
export function MessageText({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const picks = /(?:^|\n)(PICKS:\s*([^\n]+))\s*$/.exec(text);
  const body = picks ? text.slice(0, picks.index) : text;
  const limit = compact ? 240 : 700;
  const lines = compact ? 6 : 12;
  const long = body.length > limit || body.split("\n").length > lines;
  const preview = body.slice(0, limit).split("\n").slice(0, lines).join("\n");
  return (
    <>
      <div id={id}>
        <FormattedText text={long && !expanded ? preview : body} />
        {long && !expanded && <span className="muted">…</span>}
      </div>
      {long && (
        <button
          className="text-button show-more"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show more"}{" "}
          <span aria-hidden="true">{expanded ? "↑" : "↓"}</span>
        </button>
      )}
      {picks && (
        <div className="picks" aria-label="Agent picks">
          <span className="picks-label">PICKS:</span>
          {picks[2].split(";").map((pick, i) => (
            <span
              key={i}
              className={`pick ${/\blong\b/i.test(pick) ? "long" : /\bshort\b/i.test(pick) ? "short" : ""}`}
            >
              {pick.trim()}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
