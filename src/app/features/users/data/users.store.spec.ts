import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { User } from '@core/models';
import { UsersApi } from './users-api.service';
import { UsersStore } from './users.store';

describe('UsersStore', () => {
  const user = (id: number, name: string): User => ({
    id,
    name,
    email: `${name}@example.com`,
    role: 'user',
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  });

  const api = {
    list: vi.fn(() => of([user(1, 'a'), user(2, 'b')])),
    create: vi.fn((p: Omit<User, 'id' | 'createdAt'>) => of({ ...user(3, p.name), ...p })),
    update: vi.fn((id: number, p: Omit<User, 'id' | 'createdAt'>) =>
      of({ ...user(id, p.name), ...p }),
    ),
    remove: vi.fn(() => of(undefined)),
  };

  let store: UsersStore;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [UsersStore, { provide: UsersApi, useValue: api }],
    });
    store = TestBed.inject(UsersStore);
  });

  it('loads users only once unless forced', () => {
    store.load();
    store.load();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(store.count()).toBe(2);

    store.load(true);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('create / update / remove keep the list in sync', () => {
    store.load();
    const payload = { name: 'c', email: 'c@example.com', role: 'user' as const, active: true };

    store.create(payload).subscribe();
    expect(store.users().map((u) => u.name)).toEqual(['a', 'b', 'c']);

    store.update(1, { ...payload, name: 'a2' }).subscribe();
    expect(store.users()[0].name).toBe('a2');

    store.remove(2).subscribe();
    expect(store.users().map((u) => u.id)).toEqual([1, 3]);
  });
});
