import { defineCliConfig } from "sanity/cli";
export default defineCliConfig({
  api: { projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? "ynsa3nyp", dataset: "production" },
  studioHost: "memdb-oracle",
  deployment: { appId: "vl4iigt9fc0c1fgxyi07tp4w" },
});
