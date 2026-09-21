interface UpsertEntityPayload {
  system: string;
  instanceId: string;
  entityType: string;
  externalId: string;
  name: string;
  homePlaceId: string | null;
  stadiumPlaceId: string | null;
  url: string;
}

/** Universal entity card returned by Imaginations' GET /api/entity/:id. */
export interface WorldEntityCard {
  id: string;
  name: string;
  type: string;
  kind: string;
  code: string | null;
  breadcrumbs: string[];
  ancestors: { id: string; name: string; kind: string; code: string | null }[];
  summary: string;
  url: string;
  revision: number;
  updatedAt: string;
}

/** `offline` means the world could not be reached - callers must keep using their local snapshot. */
export type CardResult =
  | { status: 'ok'; card: WorldEntityCard }
  | { status: 'missing' }
  | { status: 'offline' };

const READ_TIMEOUT_MS = 3000;

class WorldClient {
  private apiUrl: string;
  private worldId: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.apiUrl = process.env.IMAGINATION_API_URL || '';
    this.worldId = process.env.IMAGINATION_WORLD_ID || '';
    this.clientId = process.env.IMAGINATION_CLIENT_ID || '';
    this.clientSecret = process.env.IMAGINATION_CLIENT_SECRET || '';
  }

  private isConfigured(): boolean {
    return Boolean(this.apiUrl && this.worldId && this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const now = Date.now();
    // 60s safety margin
    if (this.accessToken && this.tokenExpiresAt > now + 60000) {
      return this.accessToken;
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);

      const res = await fetch(`${this.apiUrl}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!res.ok) {
        throw new Error(`Token fetch failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      this.accessToken = data.access_token;
      this.tokenExpiresAt = now + data.expires_in * 1000;
      return this.accessToken;
    } catch (err) {
      console.warn('Failed to get imagination access token:', err);
      return null;
    }
  }

  /** Reads are public, so they only need the API url, not client credentials. */
  public canRead(): boolean {
    return Boolean(this.apiUrl);
  }

  public async getCard(entityId: string): Promise<CardResult> {
    if (!this.canRead()) return { status: 'offline' };
    try {
      const res = await fetch(
        `${this.apiUrl}/api/entity/${encodeURIComponent(entityId)}`,
        { signal: AbortSignal.timeout(READ_TIMEOUT_MS) }
      );
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) return { status: 'offline' };
      return { status: 'ok', card: (await res.json()) as WorldEntityCard };
    } catch (err) {
      console.warn('WorldClient: getCard failed:', err);
      return { status: 'offline' };
    }
  }

  /** Batch lookup. Unknown ids are simply absent from `cards`; `offline` is true when the world was unreachable. */
  public async getCards(
    entityIds: string[]
  ): Promise<{ cards: Map<string, WorldEntityCard>; offline: boolean }> {
    const cards = new Map<string, WorldEntityCard>();
    if (!this.canRead()) return { cards, offline: true };
    for (let i = 0; i < entityIds.length; i += 100) {
      const chunk = entityIds.slice(i, i + 100);
      try {
        const res = await fetch(
          `${this.apiUrl}/api/entity?ids=${chunk.map(encodeURIComponent).join(',')}`,
          { signal: AbortSignal.timeout(READ_TIMEOUT_MS) }
        );
        if (!res.ok) return { cards, offline: true };
        for (const card of (await res.json()) as WorldEntityCard[]) {
          cards.set(card.id, card);
        }
      } catch (err) {
        console.warn('WorldClient: getCards failed:', err);
        return { cards, offline: true };
      }
    }
    return { cards, offline: false };
  }

  public async upsertEntity(club: any): Promise<void> {
    if (!this.isConfigured()) {
      console.debug('WorldClient: skipping upsertEntity, not configured');
      return;
    }

    const token = await this.getAccessToken();
    if (!token) return;

    const fsproUrl = process.env.FSPRO_CLIENT_URL || 'http://localhost:5173';
    
    const payload: UpsertEntityPayload = {
      system: 'football',
      instanceId: 'main',
      entityType: 'club',
      externalId: club.id || club._id,
      name: club.Name,
      // Anchors live in Address.entity_id / Stadium.entity_id; the legacy columns are a fallback.
      homePlaceId: club.Address?.entity_id || club.homePlaceId || null,
      stadiumPlaceId: club.Stadium?.entity_id || club.stadiumPlaceId || null,
      url: `${fsproUrl}/clubs/${club.id || club._id}`,
    };

    try {
      const res = await fetch(`${this.apiUrl}/api/v1/worlds/${this.worldId}/entities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Entity upsert failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn('Failed to upsert entity to imagination:', err);
    }
  }

  public async recordMatchResult(data: any): Promise<void> {
    if (!this.isConfigured()) return;

    const token = await this.getAccessToken();
    if (!token) return;

    try {
      const res = await fetch(`${this.apiUrl}/api/v1/worlds/${this.worldId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error(`Record match result failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn('Failed to record match result to imagination:', err);
    }
  }
}

export const worldClient = new WorldClient();
