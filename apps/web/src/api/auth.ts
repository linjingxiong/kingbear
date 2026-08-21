import request from "./request";

export interface LoginResult {
  token: string;
  username: string;
}

export function login(username: string, password: string) {
  return request.post<never, LoginResult>("/auth/login", { username, password });
}
