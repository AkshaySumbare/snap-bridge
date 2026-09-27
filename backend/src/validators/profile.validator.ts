import { z } from "zod";

export const confirmAvatarSchema = z.object({
  publicId: z.string().min(1),
  secureUrl: z.string().url(),
});

/** Permanent account deletion — `confirm` avoids accidental calls. */
export const deleteAccountSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Send confirm: true to delete your account' }),
  }),
  /** Required when the account uses email/password sign-in. */
  password: z.string().min(1).optional(),
});
