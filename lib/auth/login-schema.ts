import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Podaj adres e-mail.")
    .pipe(z.email("Nieprawidłowy adres e-mail.")),
  password: z.string().min(1, "Podaj hasło."),
  next: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
