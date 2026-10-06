import {
  agentNumber,
  bounded,
  jobEvents,
  jobGroup,
  panelEvents,
  submissionEvents,
} from "./data";
import type {
  Event,
  Group,
  Job,
  Panel,
  Seat,
  Snapshot,
  Submission,
} from "./types";
const BASE = "https://api.imd.fun";
const GAP = 700;
export const REFRESH_MS = 60_000;
export class SwarmFeed {
  private events: Event[] = [];
  private groups: Record<string, Group> = {};
  private versions = new Map<string, string>();
  private seats: Seat[] = [];
  private lastRequest = 0;
  private requestTimes: number[] = [];
  private nextCycle = 0;
  private stopped = false;
  private busy = false;
  private updated: number | null = null;
  private errors: string[] = [];
  private swarmLoaded = false;
  private controller = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  constructor(private emit: (snapshot: Snapshot) => void) {}
  private publish() {
    if (!this.stopped)
      this.emit({
        events: this.events,
        groups: { ...this.groups },
        seats: this.seats,
        loading:
          this.busy &&
          this.updated === null &&
          this.events.length === 0 &&
          this.errors.length === 0,
        busy: this.busy,
        updated: this.updated,
        errors: [...this.errors],
        swarmLoaded: this.swarmLoaded,
      });
  }
  private async get<T>(path: string): Promise<T> {
    // One queue for every endpoint, including manual retries: <86 starts/minute.
    const wait = Math.max(0, this.lastRequest + GAP - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    if (this.stopped) throw new Error("Stopped");
    this.requestTimes = this.requestTimes.filter(
      (t) => Date.now() - t < REFRESH_MS,
    );
    if (this.requestTimes.length >= 85)
      throw new Error("Request budget reached; retrying next minute.");
    this.lastRequest = Date.now();
    this.requestTimes.push(this.lastRequest);
    const timeout = AbortSignal.timeout(7000);
    const response = await fetch(`${BASE}${path}`, {
      signal: AbortSignal.any([this.controller.signal, timeout]),
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  private merge(events: Event[]) {
    this.events = bounded([...this.events, ...events]);
    this.publish();
  }
  private fail(endpoint: string, error: unknown) {
    if (!this.stopped) {
      this.errors.push(
        `${endpoint}: ${error instanceof Error ? error.message : "Unable to connect"}`,
      );
      this.publish();
    }
  }
  async refresh() {
    if (this.stopped || this.busy || Date.now() < this.nextCycle) return;
    this.nextCycle = Date.now() + 10_000;
    this.busy = true;
    this.errors = [];
    this.publish();
    let jobs: Job[] = [];
    try {
      const data = await this.get<{ jobs: Job[] }>("/jobs?limit=30");
      if (!Array.isArray(data.jobs))
        throw new Error("Unexpected jobs response");
      jobs = data.jobs
        .filter(
          (j) =>
            j &&
            typeof j.id === "string" &&
            typeof j.template === "string" &&
            typeof j.objective === "string",
        )
        .slice(0, 30);
      for (const job of jobs) {
        if (job.template === "research") continue;
        this.groups[job.id] = jobGroup(job);
        this.merge(jobEvents(job));
      }
    } catch (e) {
      this.fail("Jobs", e);
    }
    try {
      const data = await this.get<{ panels: Panel[] }>("/research/panels");
      if (!Array.isArray(data.panels))
        throw new Error("Unexpected panels response");
      for (const panel of data.panels) {
        if (
          !panel ||
          typeof panel.jobId !== "string" ||
          typeof panel.question !== "string" ||
          !Array.isArray(panel.answers)
        )
          continue;
        const { group, events } = panelEvents(panel);
        this.groups[group.id] = group;
        this.events = this.events.filter((e) => e.groupId !== group.id);
        this.merge(events);
      }
    } catch (e) {
      this.fail("Research", e);
    }
    // Fetch completed work first so a healthy connection shows messages promptly.
    const changed = jobs
      .filter(
        (j) =>
          j.template !== "research" && this.versions.get(j.id) !== j.updatedAt,
      )
      .sort(
        (a, b) =>
          Number(b.state === "completed") - Number(a.state === "completed"),
      );
    for (const [index, job] of changed.entries()) {
      if (this.stopped) return;
      if (index === 1) await this.refreshSeats();
      try {
        const data = await this.get<{ submissions: Submission[] }>(
          `/jobs/${encodeURIComponent(job.id)}/submissions`,
        );
        if (!Array.isArray(data.submissions))
          throw new Error("Unexpected submissions response");
        this.versions.set(job.id, job.updatedAt);
        this.events = this.events.filter(
          (e) => !(e.groupId === job.id && e.kind === "message"),
        );
        this.merge(submissionEvents(job, data.submissions));
      } catch (e) {
        this.fail("Submissions", e);
      }
    }
    if (changed.length < 2) await this.refreshSeats();
    const keep = new Set(this.events.map((e) => e.groupId));
    for (const id of Object.keys(this.groups))
      if (!keep.has(id)) delete this.groups[id];
    const recent = new Set(jobs.map((j) => j.id));
    for (const id of this.versions.keys())
      if (!recent.has(id)) this.versions.delete(id);
    this.busy = false;
    if (!this.errors.length) this.updated = Date.now();
    this.publish();
  }
  private async refreshSeats() {
    try {
      const data = await this.get<{ seats: Record<string, Seat> }>("/swarm");
      if (!data.seats || typeof data.seats !== "object")
        throw new Error("Unexpected swarm response");
      this.seats = Object.values(data.seats).filter(
        (s) => s && agentNumber(s.tokenId) !== undefined,
      );
      this.swarmLoaded = true;
      this.publish();
    } catch (e) {
      this.fail("Swarm", e);
    }
  }
  start() {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
  }
  stop() {
    this.stopped = true;
    this.controller.abort();
    clearInterval(this.timer);
  }
}
