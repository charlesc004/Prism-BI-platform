import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { Request, Response, NextFunction } from "express";
import { db } from "../../config/database.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import type { Identity, Role } from "@prism/contracts";
declare module "express-serve-static-core" {
  interface Request {
    identity: Identity;
    sessionId: string;
  }
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("hex");
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
};
export function clearCookies(res: Response) {
  res.clearCookie("prism_access", { ...cookieOptions, path: "/api" });
  res.clearCookie("prism_refresh", cookieOptions);
  res.clearCookie("prism_csrf", {
    ...cookieOptions,
    httpOnly: false,
    path: "/",
  });
}
async function setSession(
  res: Response,
  userId: string,
  consumed?: { id: string; refreshHash: string },
) {
  const access = token(),
    refresh = token(),
    csrf = token();
  const data = {
    userId,
    tokenHash: hash(access),
    refreshHash: hash(refresh),
    csrf,
    expiresAt: new Date(Date.now() + 15 * 60000),
    refreshExpiresAt: new Date(Date.now() + 7 * 86400000),
  };
  if (consumed) {
    await db.$transaction(async (tx) => {
      const removed = await tx.session.deleteMany({ where: consumed });
      if (!removed.count)
        throw new AppError(401, "Refresh token has already been used");
      await tx.session.create({ data });
    });
  } else await db.session.create({ data });
  res.cookie("prism_access", access, {
    ...cookieOptions,
    path: "/api",
    maxAge: 15 * 60000,
  });
  res.cookie("prism_refresh", refresh, {
    ...cookieOptions,
    maxAge: 7 * 86400000,
  });
  res.cookie("prism_csrf", csrf, {
    ...cookieOptions,
    httpOnly: false,
    path: "/",
    maxAge: 7 * 86400000,
  });
}
export async function login(email: string, password: string, res: Response) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user?.active || !(await argon2.verify(user.passwordHash, password)))
    throw new AppError(401, "Email or password is incorrect");
  await setSession(res, user.id);
}
export async function refresh(req: Request, res: Response) {
  const value = req.cookies.prism_refresh as string | undefined;
  if (!value) throw new AppError(401, "Session expired");
  // Consume the old refresh token transactionally: simultaneous replay cannot rotate it twice.
  const session = await db.session.findUnique({
    where: { refreshHash: hash(value) },
    include: { user: true },
  });
  if (!session || session.refreshExpiresAt < new Date() || !session.user.active)
    throw new AppError(401, "Session expired");
  checkCsrf(req, session.csrf);
  await setSession(res, session.userId, {
    id: session.id,
    refreshHash: hash(value),
  });
}
function checkCsrf(req: Request, expected: string) {
  const value = req.get("X-CSRF-Token") || "";
  const supplied = Buffer.from(value);
  const expectedBytes = Buffer.from(expected);
  if (
    supplied.length !== expectedBytes.length ||
    !timingSafeEqual(supplied, expectedBytes)
  )
    throw new AppError(403, "Invalid CSRF token; reload and try again");
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const access = req.cookies.prism_access as string | undefined;
  if (!access) throw new AppError(401, "Please sign in");
  const session = await db.session.findUnique({
    where: { tokenHash: hash(access) },
    include: { user: { include: { members: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    throw new AppError(401, "Session expired");
  const member = session.user.members[0];
  if (!member) throw new AppError(403, "Workspace access unavailable");
  req.identity = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: member.role,
    workspaceId: member.workspaceId,
  };
  req.sessionId = session.id;
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
    checkCsrf(req, session.csrf);
  next();
}
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.identity.role))
      throw new AppError(403, "Your role does not permit this action");
    next();
  };
}
