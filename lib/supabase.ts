import "server-only";

export { configuration } from "./finance-auth";

export function appOrigin() {
  const url=process.env.APP_ORIGIN;
  return url?new URL(url).origin:"http://localhost:3000";
}
