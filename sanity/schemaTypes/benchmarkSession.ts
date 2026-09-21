import { defineField, defineType } from "sanity";

/** A capture session = one set of instances on one date. Runs from different sessions are never compared silently. */
export const benchmarkSession = defineType({
  name: "benchmarkSession", title: "Benchmark session", type: "document",
  fields: [
    defineField({ name: "number", type: "number", validation: (r) => r.required().integer().positive() }),
    defineField({ name: "label", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sourceCsv", type: "string" }),
  ],
  preview: { select: { title: "label" } },
});
