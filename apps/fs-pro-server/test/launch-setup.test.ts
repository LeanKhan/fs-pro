import { describe, expect, it } from 'vitest';
import { uniqueUsername, usernameFromEmail } from '../src/utils/launch-setup';

describe('launch-setup helpers', () => {
  it('derives a username from the email local part', () => {
    expect(usernameFromEmail('Owner@Example.com')).toBe('owner');
    expect(usernameFromEmail('first.last@club.gg')).toBe('first.last');
    expect(usernameFromEmail('a@b.com')).toBe('admina');
  });

  it('avoids a taken username, case-insensitively', () => {
    expect(uniqueUsername('owner', [])).toBe('owner');
    expect(uniqueUsername('owner', ['Owner'])).toBe('owner2');
    expect(uniqueUsername('owner', ['owner', 'owner2'])).toBe('owner3');
  });
});
