import { convexTest } from "convex-test";
import schema from "../schema";

const rawModules = import.meta.glob("../**/*.ts");
const modules = Object.fromEntries(
  Object.entries(rawModules).filter(([path]) => !path.includes("/tests/")),
);

export const createTestClient = () => convexTest(schema, modules);
