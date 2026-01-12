import { ConvexHttpClient } from "convex/browser";

export const createConvexClient = (url: string) => new ConvexHttpClient(url);
