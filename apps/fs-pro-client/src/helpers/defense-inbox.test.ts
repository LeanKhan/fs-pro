import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DefenseEntry, DefenseLog, Inbox } from '@repo/api-contract';
import {
  defenseHeadline,
  defenseOutcome,
  defenseOutcomeLabel,
  defenseView,
  defenseViews,
  inboxView,
  scoreLabel,
  starsLabel,
  unreadCount,
} from './defense-inbox';

const NOW = '2026-10-10T12:00:00.000Z';

function entry(overrides: Partial<DefenseEntry> = {}): DefenseEntry {
  return {
    raidId: 'r1',
    attackerId: 'a1',
    attackerName: 'Riverside FC',
    attackerCode: 'RIV',
    practice: false,
    score: { you: 1, them: 2 },
    outcome: 'loss',
    stars: 1,
    lootLost: { cash: 65000, fans: 13000, tokens: 0 },
    shieldUntil: null,
    guardUntil: null,
    resolvedAt: NOW,
    ...overrides,
  };
}

describe('scoreLabel / starsLabel', () => {
  it('renders an en-dash score and a clamped star token', () => {
    assert.equal(scoreLabel(1, 2), '1–2');
    assert.equal(starsLabel(0), '0★');
    assert.equal(starsLabel(3), '3★');
    assert.equal(starsLabel(9), '3★');
    assert.equal(starsLabel(-1), '0★');
  });
});

describe('defenseOutcome', () => {
  it('is from the defender goal count first', () => {
    assert.equal(defenseOutcome(2, 0), 'win');
    assert.equal(defenseOutcome(0, 2), 'loss');
    assert.equal(defenseOutcome(1, 1), 'draw');
  });
  it('labels the outcomes', () => {
    assert.equal(defenseOutcomeLabel('win'), 'Repelled');
    assert.equal(defenseOutcomeLabel('draw'), 'Held');
    assert.equal(defenseOutcomeLabel('loss'), 'Raided');
  });
});

describe('defenseHeadline', () => {
  it('matches the brief: "You were raided 1–2, 1★"', () => {
    assert.equal(
      defenseHeadline('Riverside FC', 1, 2, 1),
      'You were raided 1–2, 1★'
    );
  });
  it('says a win repelled and a draw held', () => {
    assert.equal(
      defenseHeadline('Riverside FC', 3, 0, 3),
      'You repelled Riverside FC 3–0 (3★)'
    );
    assert.equal(
      defenseHeadline('Riverside FC', 2, 2, 2),
      'Riverside FC drew 2–2 at your ground (2★)'
    );
  });
});

describe('defenseView', () => {
  it('carries only the non-zero loot currencies', () => {
    const view = defenseView(entry());
    assert.equal(view.outcome, 'loss');
    assert.equal(view.headline, 'You were raided 1–2, 1★');
    assert.deepEqual(
      view.lootParts.map((p) => p.key),
      ['cash', 'fans']
    );
    assert.deepEqual(view.lootParts.map((p) => p.amount), [65000, 13000]);
    assert.equal(view.hasLoot, true);
    // Absolute timestamps pass through untouched for CozyCountdown.
    assert.equal(view.resolvedAt, NOW);
    assert.equal(view.shieldUntil, null);
  });

  it('is an empty loot bag when nothing was stolen', () => {
    const view = defenseView(
      entry({ lootLost: { cash: 0, fans: 0, tokens: 0 }, stars: 0 })
    );
    assert.equal(view.hasLoot, false);
    assert.deepEqual(view.lootParts, []);
    assert.equal(view.starsLabel, '0★');
  });

  it('maps a whole log in order', () => {
    const log: DefenseLog = {
      defenses: [entry({ raidId: 'r2' }), entry({ raidId: 'r1' })],
      now: NOW,
    };
    assert.deepEqual(
      defenseViews(log).map((d) => d.raidId),
      ['r2', 'r1']
    );
  });
});

describe('inboxView / unreadCount', () => {
  it('orders messages newest first and keeps the unread count', () => {
    const inbox: Inbox = {
      unread: 2,
      messages: [
        {
          id: 'm1',
          kind: 'board',
          tone: 'neutral',
          title: 'Old',
          body: '',
          read: true,
          createdAt: '2026-10-09T12:00:00.000Z',
        },
        {
          id: 'm2',
          kind: 'fans',
          tone: 'good',
          title: 'New',
          body: '',
          read: false,
          createdAt: '2026-10-10T12:00:00.000Z',
        },
      ],
    };
    const view = inboxView(inbox);
    assert.deepEqual(
      view.messages.map((m) => m.id),
      ['m2', 'm1']
    );
    assert.equal(view.unread, 2);
    assert.equal(unreadCount(inbox), 2);
  });

  it('never reports a negative unread count', () => {
    assert.equal(unreadCount({ unread: -3, messages: [] }), 0);
  });
});
