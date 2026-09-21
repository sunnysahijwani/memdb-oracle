import { defineField, defineType } from "sanity";

/** A headline conclusion with its number, its caveat, and the runs it rests on. */
export const finding = defineType({
  name: "finding", title: "Finding", type: "document",
  fields: [
    defineField({ name: "slug", type: "string", validation: (r) => r.required() }),
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "statement", type: "text", validation: (r) => r.required(), description: "The claim, as precisely as the data supports it" }),
    defineField({ name: "caveat", type: "text", description: "What must be said alongside the number (e.g. client-limited, session boundary)" }),
    defineField({ name: "session", type: "number" }),
    defineField({ name: "engines", type: "array", of: [{ type: "reference", to: [{ type: "engine" }] }] }),
    defineField({ name: "metrics", type: "array", of: [{ type: "object", fields: [
      { name: "label", type: "string" }, { name: "value", type: "number" }, { name: "unit", type: "string" },
    ] }] }),
    defineField({ name: "sourceUrl", type: "url", description: "Blog post that explains it" }),
    defineField({ name: "vendorClaim", type: "text", description: "Verbatim vendor claim this finding is often compared against, if any" }),
    defineField({ name: "vendorClaimUrl", type: "url" }),
  ],
  preview: { select: { title: "title", subtitle: "slug" } },
});
