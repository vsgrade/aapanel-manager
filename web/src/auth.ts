import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type {Role} from '@prisma/client';
import {prisma} from '@/lib/db/prisma';
import {verifyPassword} from '@/lib/crypto/password';
import {signInSchema} from '@/lib/validation/auth';

export const {handlers, auth, signIn, signOut} = NextAuth({
  session: {strategy: 'jwt'},
  pages: {signIn: '/login'},
  providers: [
    Credentials({
      credentials: {email: {}, password: {}},
      authorize: async (raw) => {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const {email, password} = parsed.data;
        const user = await prisma.user.findUnique({where: {email}});
        if (!user) return null;
        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) return null;
        return {id: user.id, email: user.email, role: user.role};
      },
    }),
  ],
  callbacks: {
    jwt({token, user}) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as {role: Role}).role;
      }
      return token;
    },
    session({session, token}) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
