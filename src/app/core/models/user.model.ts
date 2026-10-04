export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export type UserPayload = Omit<User, 'id' | 'createdAt'>;
