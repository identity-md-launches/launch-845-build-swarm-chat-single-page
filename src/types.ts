export type Channel = "builds" | "audits" | "research" | "oracle";
export type Filter = Channel | "all";
export type Seat = {
  tokenId: string | number;
  agentId?: string;
  working?: boolean;
  attempts?: number;
  accepted?: number;
  last?: string;
};
export type Job = {
  id: string;
  template: string;
  objective: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  delivery?: { pullRequestUrl?: string; deliveredAt?: string } | null;
};
export type Submission = {
  hash?: string;
  seat?: Seat | null;
  model?: string;
  usage?: { model?: string };
  role?: string;
  nodeKey?: string;
  attempt?: number;
  createdAt: string;
  summary?: string | null;
  verdict?: { status?: string; detail?: string } | null;
  safetyRefusal?: boolean;
};
export type Panel = {
  jobId: string;
  nodeId?: string;
  question: string;
  askedAt: string;
  closedAt?: string | null;
  answers: { seat?: Seat | null; runtime?: string; answer?: string | null }[];
};
export type Group = {
  id: string;
  jobId: string;
  objective: string;
  kind: "job" | "panel";
};
export type Event = {
  id: string;
  groupId: string;
  channel: Channel;
  timestamp: number;
  kind: "message" | "system";
  text: string;
  tokenId?: string;
  model?: string;
  role?: string;
  estimated?: boolean;
  verdict?: Submission["verdict"];
  safetyRefusal?: boolean;
  href?: string;
};
export type Snapshot = {
  events: Event[];
  groups: Record<string, Group>;
  seats: Seat[];
  loading: boolean;
  busy: boolean;
  updated: number | null;
  errors: string[];
  swarmLoaded: boolean;
};
