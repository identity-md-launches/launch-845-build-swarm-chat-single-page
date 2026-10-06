import type { Channel, Event, Group, Job, Panel, Submission } from "./types";
export const MAX_MESSAGES = 1000;
export const validText = (s: unknown): s is string =>
  typeof s === "string" &&
  !!s.trim() &&
  !s.trimStart().startsWith("This seat produced no answer");
export const stamp = (s: string | undefined | null, fallback = 0) => {
  const n = Date.parse(s || "");
  return Number.isFinite(n) ? n : fallback;
};
export const agentNumber = (id: unknown) =>
  typeof id === "number" || typeof id === "string"
    ? /^\d+$/.test(String(id))
      ? String(id)
      : undefined
    : undefined;
export const safeHttps = (value?: string) => {
  try {
    const u = new URL(value || "");
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
export function channelFor(job: Job, submission?: Submission): Channel {
  if (job.template === "research") return "research";
  if (job.template.toLowerCase().includes("oracle")) return "oracle";
  if (
    submission?.nodeKey?.startsWith("audit_") ||
    /review|audit/i.test(submission?.role || "")
  )
    return "audits";
  return "builds";
}
export const jobGroup = (job: Job): Group => ({
  id: job.id,
  jobId: job.id,
  objective: job.objective,
  kind: "job",
});
export function jobEvents(job: Job): Event[] {
  const base = {
    groupId: job.id,
    channel: channelFor(job),
    kind: "system" as const,
  };
  const events: Event[] = [
    {
      ...base,
      id: `${job.id}:opened`,
      text: "New job opened",
      timestamp: stamp(job.createdAt),
    },
  ];
  if (job.delivery?.pullRequestUrl)
    events.push({
      ...base,
      id: `${job.id}:delivered`,
      text: "Delivered",
      timestamp: stamp(job.delivery.deliveredAt, stamp(job.updatedAt)),
      href: safeHttps(job.delivery.pullRequestUrl),
    });
  return events;
}
export function submissionEvents(job: Job, submissions: Submission[]): Event[] {
  return submissions.flatMap((s, i): Event[] => {
    const tokenId = agentNumber(s.seat?.tokenId);
    if (!validText(s.summary) || tokenId === undefined) return [];
    return [
      {
        id: `${job.id}:submission:${s.hash || `${s.nodeKey}:${s.attempt}:${tokenId}:${s.createdAt}:${i}`}`,
        groupId: job.id,
        kind: "message",
        channel: channelFor(job, s),
        timestamp: stamp(s.createdAt, stamp(job.createdAt)),
        tokenId,
        text: s.summary,
        model: s.model || s.usage?.model || "Model unreported",
        role: s.role || "agent",
        verdict: s.verdict,
        safetyRefusal: s.safetyRefusal,
      },
    ];
  });
}
export function panelEvents(panel: Panel): { group: Group; events: Event[] } {
  const id = `panel:${panel.jobId}:${panel.nodeId || panel.askedAt}`;
  const group: Group = {
    id,
    jobId: panel.jobId,
    objective: panel.question,
    kind: "panel",
  };
  const answers = panel.answers.filter(
    (a) => validText(a.answer) && agentNumber(a.seat?.tokenId) !== undefined,
  );
  const start = stamp(panel.askedAt);
  const end = Math.max(start, stamp(panel.closedAt, start));
  const events: Event[] = answers.map((a, i) => ({
    id: `${id}:answer:${agentNumber(a.seat?.tokenId)}:${i}`,
    groupId: id,
    channel: "research",
    kind: "message",
    tokenId: agentNumber(a.seat?.tokenId),
    model: a.runtime || "Runtime unreported",
    role: "research",
    timestamp: start + ((end - start) * (i + 1)) / (answers.length + 1),
    estimated: true,
    text: a.answer!,
  }));
  events.unshift({
    id: `${id}:opened`,
    groupId: id,
    kind: "system",
    channel: "research",
    text: "New job opened",
    timestamp: start,
  });
  if (panel.closedAt)
    events.push({
      id: `${id}:closed`,
      groupId: id,
      kind: "system",
      channel: "research",
      text: `Panel closed with ${answers.length} answers`,
      timestamp: end,
    });
  return { group, events };
}
export const sortEvents = (events: Event[]) =>
  events.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
export const bounded = (events: Event[]) =>
  sortEvents([...new Map(events.map((e) => [e.id, e])).values()]).slice(
    -MAX_MESSAGES,
  );
