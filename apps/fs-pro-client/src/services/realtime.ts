import { reactive, ref } from 'vue';
import { apiUrl } from './api';
import { associationIdsFrom } from '@/helpers/realtime-ticket';

/**
 * The live connection to the multiplayer gateway (apps/fs-pro-realtime).
 * Screens `join` the topics they care about and `on` the events they handle;
 * the connection opens on first use, survives drops (with backoff and a fresh
 * ticket each time) and re-joins every topic after reconnecting.
 *
 * Topics: `world`, `club:<id>` (own clubs only), `campus:<id>`,
 * `edition:<id>`, `fixture:<id>`.
 */

export interface Member {
  uid: string;
  name: string;
  code?: string;
}

export interface ChatMessage {
  id: number;
  topic: string;
  from: Member;
  text: string;
  at: number;
}

const BLOCKED_KEY = 'fspro-blocked-players';

function loadBlocked(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveBlocked(uids: string[]) {
  try {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(uids.slice(-200)));
  } catch {
    /* private mode: blocking lasts until the tab closes */
  }
}

type Handler = (data: any, meta: { topic: string; event: string }) => void;

const DEDUPE_MS = 1500;

class Realtime {
  readonly status = ref<'off' | 'connecting' | 'live'>('off');
  readonly online = ref(0);
  readonly me = ref<Member | null>(null);
  /** Who is on each presence topic (campus:<id> etc.). */
  readonly presence = reactive(new Map<string, Member[]>());
  /** Chat lines per topic, oldest first. */
  readonly chats = reactive(new Map<string, ChatMessage[]>());
  readonly lastError = ref('');
  /** Good news from the gateway (a report was received), shown like an error but calmer. */
  readonly lastNotice = ref('');
  /** Association ids this manager's clubs belong to, from the ticket's `assocs`
   * claim (08 §4, OW-N10). No REST route exposes membership, so the ticket is
   * the cheapest discovery path; empty until the first successful connect. */
  readonly associationIds = ref<string[]>([]);
  /** Players this browser has blocked: their lines are hidden. Kept per device. */
  readonly blocked = reactive(new Set<string>(loadBlocked()));

  private ws: WebSocket | null = null;
  private topics = new Map<string, number>();
  private handlers = new Map<string, Set<Handler>>();
  private recent = new Map<string, number>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;

  on(event: string, fn: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    this.ensure();
  }

  off(event: string, fn: Handler) {
    this.handlers.get(event)?.delete(fn);
  }

  /** Follow a topic; every join needs a matching leave. */
  join(topic: string) {
    const n = this.topics.get(topic) ?? 0;
    this.topics.set(topic, n + 1);
    if (n === 0) this.send({ op: 'sub', topic });
    this.ensure();
  }

  leave(topic: string) {
    const n = this.topics.get(topic) ?? 0;
    if (n <= 1) {
      this.topics.delete(topic);
      this.send({ op: 'unsub', topic });
      this.presence.delete(topic);
    } else this.topics.set(topic, n - 1);
  }

  say(topic: string, text: string) {
    const t = text.trim();
    if (t) this.send({ op: 'say', topic, text: t });
  }

  /** Tell the moderators about a chat line. */
  report(topic: string, id: number, reason = '') {
    this.send({ op: 'report', topic, id, text: reason });
  }

  block(uid: string) {
    this.blocked.add(uid);
    saveBlocked([...this.blocked]);
  }

  unblock(uid: string) {
    this.blocked.delete(uid);
    saveBlocked([...this.blocked]);
  }

  /** Close for good (logout). */
  disconnect() {
    this.wanted = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
    this.status.value = 'off';
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private ensure() {
    this.wanted = true;
    if (!this.ws && !this.timer && this.status.value !== 'connecting') void this.connect();
  }

  private async connect() {
    if (!window.localStorage.getItem('fspro-user')) return; // signed out
    this.status.value = 'connecting';
    try {
      const res = await fetch(`${apiUrl}/api/realtime/ticket`, { credentials: 'include' });
      if (!res.ok) throw new Error(res.status === 401 ? 'signed out' : `ticket ${res.status}`);
      const { payload } = (await res.json()) as { payload: { url: string; ticket: string } };
      this.associationIds.value = associationIdsFrom(payload.ticket);
      const ws = new WebSocket(`${payload.url}?ticket=${encodeURIComponent(payload.ticket)}`);
      this.ws = ws;
      ws.onopen = () => {
        this.status.value = 'live';
        this.retry = 0;
        this.lastError.value = '';
        for (const topic of this.topics.keys()) this.send({ op: 'sub', topic });
      };
      ws.onmessage = (e) => this.receive(e.data as string);
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.status.value = 'off';
        this.scheduleReconnect();
      };
    } catch (err) {
      this.lastError.value = err instanceof Error ? err.message : String(err);
      this.status.value = 'off';
      this.ws = null;
      if (this.lastError.value !== 'signed out') this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.wanted || this.timer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.retry++) * (0.75 + Math.random() * 0.5);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delay);
  }

  private receive(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'hello':
        this.me.value = msg.you;
        this.online.value = msg.online;
        break;
      case 'online':
        this.online.value = msg.count;
        break;
      case 'presence':
        this.presence.set(msg.topic, msg.members ?? []);
        break;
      case 'history':
        this.chats.set(msg.topic, msg.messages ?? []);
        break;
      case 'chat': {
        const list = [...(this.chats.get(msg.topic) ?? []), msg as ChatMessage].slice(-50);
        this.chats.set(msg.topic, list);
        this.emit('chat', msg, msg.topic);
        break;
      }
      case 'event':
        this.emit(msg.event, msg.data, msg.topic);
        break;
      case 'error':
        this.lastError.value = msg.message;
        break;
      case 'notice':
        this.lastNotice.value = msg.message;
        break;
      case 'removed': {
        // A moderator (or enough reports) pulled these lines.
        const gone = new Set<number>(msg.ids ?? []);
        this.chats.set(msg.topic, (this.chats.get(msg.topic) ?? []).filter((m) => !gone.has(m.id)));
        break;
      }
    }
  }

  private emit(event: string, data: unknown, topic: string) {
    // An event can arrive on several topics (world + club:<id>); handle it once.
    const key = `${event}|${JSON.stringify(data)}`;
    const now = Date.now();
    if ((this.recent.get(key) ?? 0) > now - DEDUPE_MS) return;
    this.recent.set(key, now);
    if (this.recent.size > 200) {
      for (const [k, t] of this.recent) if (t < now - DEDUPE_MS) this.recent.delete(k);
    }
    for (const fn of this.handlers.get(event) ?? []) {
      try {
        fn(data, { topic, event });
      } catch (err) {
        console.error(`[realtime] ${event} handler failed`, err);
      }
    }
  }
}

export const realtime = new Realtime();
