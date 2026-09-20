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
      homePlaceId: club.homePlaceId || null,
      stadiumPlaceId: club.stadiumPlaceId || null,
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
