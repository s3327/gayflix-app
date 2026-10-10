import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Every Better Auth endpoint (sign-up, sign-in, OTP, reset, sessions,
// admin) is served under /api/auth/*.
export const { GET, POST } = toNextJsHandler(auth);
