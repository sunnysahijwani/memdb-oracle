import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./schemaTypes";

export default defineConfig({
  name: "memdb-oracle",
  title: "memdb-oracle — in-memory DB benchmark data",
  projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? "ynsa3nyp",
  dataset: "production",
  plugins: [structureTool()],
  schema: { types: schemaTypes },
});
