import { z } from "zod";

export const WholeCount = z.number().int().nonnegative();
