export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  createdAt: Date;
  lastLoginAt: Date;
  updatedAt: Date;
  isAdmin: boolean;
}

export interface UserSession {
  id: string;
  userId: number;
  accessToken: string;
  refreshToken: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
}

export interface UserRegistration {
  username: string;
  displayName: string;
  email: string;
  password: string;
}

export interface UserLogin {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}