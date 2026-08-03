import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LinkGoogleIdentityInput } from '../src/auth/auth-store.js';
import { DrizzleAuthStore } from '../src/auth/drizzle-auth.store.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const IDENTITY_ID = '20000000-0000-4000-8000-000000000001';
const SESSION_ID = '30000000-0000-4000-8000-000000000001';

interface GoogleIdentityRow {
  id: string;
  providerSubject: string;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED';
  userId: string;
}

function input(providerSubject: string): LinkGoogleIdentityInput {
  return {
    audit: {
      correlationId: 'google-link-test',
      eventType: 'IDENTITY_LINKED',
      outcome: 'SUCCESS',
    },
    email: 'local.user@example.com',
    identityId: IDENTITY_ID,
    linkedAt: new Date('2026-08-03T12:00:00.000Z'),
    providerSubject,
    sessionId: SESSION_ID,
    userId: USER_ID,
  };
}

function storeWithGoogleRows(rows: GoogleIdentityRow[]): {
  getInsertCount(): number;
  store: DrizzleAuthStore;
  updates: unknown[];
} {
  let selectNumber = 0;
  const updates: unknown[] = [];
  let insertCount = 0;

  const query = (result: unknown[]): unknown => {
    const builder = {
      from: () => builder,
      limit: () => Promise.resolve(result),
      then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
      where: () => builder,
    };
    return builder;
  };

  const transaction = {
    execute: () => Promise.resolve(),
    insert: () => ({
      values: () => {
        insertCount += 1;
        return Promise.resolve();
      },
    }),
    select: () => {
      selectNumber += 1;
      return query(
        selectNumber === 1
          ? [
              {
                displayName: 'Local User',
                email: 'local.user@example.com',
                status: 'ACTIVE',
              },
            ]
          : rows,
      );
    },
    update: () => {
      const builder = {
        set: (value: unknown) => {
          updates.push(value);
          return builder;
        },
        where: () => Promise.resolve(),
      };
      return builder;
    },
  };
  const store = new DrizzleAuthStore({
    db: {
      transaction: (operation: (value: typeof transaction) => unknown) => operation(transaction),
    },
  } as never);

  return { getInsertCount: () => insertCount, store, updates };
}

describe('DrizzleAuthStore controlled Google identity replacement', () => {
  it('reactivates and replaces a disabled Google subject for the same local user', async () => {
    const fixture = storeWithGoogleRows([
      {
        id: IDENTITY_ID,
        providerSubject: 'previous-google-subject',
        status: 'DISABLED',
        userId: USER_ID,
      },
    ]);

    const result = await fixture.store.linkGoogleIdentity(input('new-google-subject'));

    assert.equal(result.kind, 'linked');
    assert.deepEqual(fixture.updates, [
      {
        providerEmailNormalized: 'local.user@example.com',
        status: 'ACTIVE',
        subjectNormalized: 'new-google-subject',
        updatedAt: new Date('2026-08-03T12:00:00.000Z'),
        verifiedAt: new Date('2026-08-03T12:00:00.000Z'),
      },
    ]);
    assert.equal(fixture.getInsertCount(), 1, 'only the immutable link audit is inserted');
  });

  it('blocks replacing an active Google subject for the same local user', async () => {
    const fixture = storeWithGoogleRows([
      {
        id: IDENTITY_ID,
        providerSubject: 'current-google-subject',
        status: 'ACTIVE',
        userId: USER_ID,
      },
    ]);

    assert.deepEqual(await fixture.store.linkGoogleIdentity(input('different-google-subject')), {
      kind: 'identity_conflict',
    });
    assert.deepEqual(fixture.updates, []);
    assert.equal(fixture.getInsertCount(), 0);
  });
});
