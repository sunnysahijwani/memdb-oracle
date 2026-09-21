import { defineField, defineType } from "sanity";

/** One in-memory data store under test. Referenced by every benchmarkRun. */
export const engine = defineType({
  name: "engine", title: "Engine", type: "document",
  fields: [
    defineField({ name: "slug", type: "string", validation: (r) => r.required().regex(/^[a-z]+$/) }),
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "vendor", type: "string" }),
    defineField({ name: "versionTested", type: "string", description: "Exact version pinned in the harness (config.env)" }),
    defineField({ name: "threadingModel", type: "string" }),
    defineField({ name: "clusterRequiredForScale", type: "boolean", description: "True when one process cannot use more than one core for command execution" }),
    defineField({ name: "notes", type: "text", description: "How this engine was configured and any caveat the agent must repeat" }),
    defineField({ name: "vendorClaimUrls", type: "array", of: [{ type: "url" }], description: "Vendor pages whose claims the Knowledge Base compares against measurements" }),
  ],
  preview: { select: { title: "name", subtitle: "versionTested" } },
});
