import { z } from "zod";

export const confirmAvatarSchema = z.object({
  publicId: z.string().min(1),
  secureUrl: z.string().url(),
});
