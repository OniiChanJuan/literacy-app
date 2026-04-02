import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { rateLimit } from "./validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,   // Refresh token if active within 24 hours
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string)?.toLowerCase()?.trim();
        const password = credentials?.password as string;

        if (!email || !password) return null;

        // Rate limit login: 5 attempts per email per 15 minutes
        if (!rateLimit(`login:${email}`, 5, 15 * 60 * 1000)) {
          throw new Error("Too many login attempts. Try again in 15 minutes.");
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user?.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
          select: { username: true, memberNumber: true },
        });

        if (existing && !existing.username) {
          (user as any).needsUsername = true;
        }

        // Assign member number if missing — covers both new users (existing=null,
        // adapter hasn't committed yet so we retry after a short delay) and
        // existing users who somehow have a null memberNumber.
        if (!existing?.memberNumber) {
          // Small delay to let the Prisma adapter finish creating the user row
          // before we try to update it (relevant for brand-new Google signups)
          await new Promise((r) => setTimeout(r, 200));
          const userRow = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true, memberNumber: true },
          });
          if (userRow && !userRow.memberNumber) {
            const maxResult = await prisma.user.aggregate({ _max: { memberNumber: true } });
            const next = (maxResult._max.memberNumber || 0) + 1;
            await prisma.user.update({
              where: { id: userRow.id },
              data: { memberNumber: next, emailVerified: new Date() },
            });
          }
        }

        // Auto-verify Google users' emails (Google already verified it)
        if (existing && !existing.username) {
          // New Google user — emailVerified gets set by the adapter
        } else if (existing) {
          // Existing user signing in with Google — ensure email is verified
          const fullUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: { emailVerified: true },
          });
          if (fullUser && !fullUser.emailVerified) {
            await prisma.user.update({
              where: { email: user.email },
              data: { emailVerified: new Date() },
            });
          }
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id;
        if ((user as any).needsUsername) {
          token.needsUsername = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
